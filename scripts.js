document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const convertBtn = document.getElementById('convertBtn');
    const copyBtn = document.getElementById('copyBtn');
    const splQuery = document.getElementById('splQuery');
    const jsonResult = document.getElementById('jsonResult');
    const rawResult = document.getElementById('rawResult');
    const statusIndicator = document.getElementById('statusIndicator');

    // Convert function
    convertBtn.addEventListener('click', function() {
        if (!splQuery.value.trim()) {
            showStatus('Please enter a query', 'error');
            return;
        }

        showStatus('Converting...', 'processing');
        setLoading(true);

        try {
            const convertedQuery = convertSplToOpenSearch(splQuery.value);
            const formattedOutput = formatOutput(convertedQuery);
            
            rawResult.textContent = formattedOutput.raw;
            jsonResult.innerHTML = syntaxHighlight(formattedOutput.json);
            showStatus('Conversion successful', 'success');
        } catch (error) {
            showStatus(`Error: ${error.message}`, 'error');
            jsonResult.innerHTML = syntaxHighlight({
                error: error.message,
                originalQuery: splQuery.value
            });
        } finally {
            setLoading(false);
        }
    });

    // Main conversion function
    function convertSplToOpenSearch(spl_query) {
        console.log("Received SPL Query:", spl_query);
        
        const cleanedQuery = clean_spl_query(spl_query);
        const first_phase_query = cleanedQuery.split("|")[0].trim();
        
        console.log("First phase query:", first_phase_query);
        
        const result = parse_stats_clause(spl_query, first_phase_query);
        const opensearch_query = result[1];
        const index_name = result[0];
        
        const DSL_header = `POST /${index_name}/_search\n`;
        const final_query_string = DSL_header + JSON.stringify(opensearch_query, null, 2);
        
        console.log("Final output:", final_query_string);
        return final_query_string;
    }

    function clean_spl_query(spl_query) {
        console.log("Inside clean_spl_query function");
        return spl_query.replace(/\s*=\s*/g, '=');
    }

    function parse_stats_clause(spl_query, first_phase_query) {
        console.log("Inside parse_stats_clause function");
        const metric_clauses = [];
        let by_clause_fields = [];
        let percentile_number = null;

        // Extract stats functions(field) and aliases
        const stats_match = spl_query.match(/\|\s*stats\s*([^|]+)/i);
        if (stats_match) {
            const stats_part = stats_match[1].trim();

            // Extract metrics like avg(field) as alias
            const metrics = [...stats_part.matchAll(/(\w+)\(("[^"]+"|\w+)?\)\s*(?:as\s+("[^"]+"|\w+))?/gi)];
            console.log("metrics", metrics);
            for (const match of metrics) {
                const func = match[1];
                const field = match[2] ? match[2].replace(/"/g, '') : "_id";
                const alias = match[3] ? match[3].replace(/"/g, '') : func;
                
                metric_clauses.push({
                    "function": func,
                    "field": field,
                    "alias": alias
                });
            }

            // Handle percentile extraction (percX)
            const percentile_match = stats_part.match(/perc(\d+)/i);
            if (percentile_match) {
                percentile_number = parseInt(percentile_match[1]);
                console.log("percentile_number", percentile_number);
            }

            // Handle standalone functions like count as total
            const standalone_metrics = [...stats_part.matchAll(/\b(\w+)\s*(?:as\s+("[^"]+"|\w+))?/g)];
            console.log("standalone_metrics", standalone_metrics);
            for (const match of standalone_metrics) {
                const func = match[1];
                const alias = match[2] ? match[2].replace(/"/g, '') : func;
                
                if (!metric_clauses.some(m => m.function === func)) {
                    metric_clauses.push({
                        "function": func,
                        "field": "_id",
                        "alias": alias
                    });
                }
            }

            // Handle multiple by fields
            const by_match = stats_part.match(/\bby\s+(.+)/);
            if (by_match) {
                by_clause_fields = by_match[1].match(/"[^"]+"|\S+/g).map(f => f.replace(/"/g, '').trim());
                console.log("by_clause_fields", by_clause_fields);    
            }
        }

        return convert_spl_to_opensearch_complex(spl_query, first_phase_query, metric_clauses, by_clause_fields, percentile_number);
    }

    function convert_spl_to_opensearch_complex(spl_query, first_phase_query, metric_clauses, by_clause_fields, percentile_number) {
        const key = [];  
        const values = [];
       
        // Improved regex pattern to properly handle IN/NOT IN clauses
        const field_value_pattern = [...first_phase_query.matchAll(/(?:sa\s+)?(?<field>"[^"]+"|\w+)\s*(?<operator>=|!=|>=|<=|>|<|NOT\s+IN|IN)\s*(?<value>"[^"]+"|'[^']+'|\([^)]+\)|\S+)/gi)];

        for (const match of field_value_pattern) {
            const field = match.groups.field.replace(/"/g, '');
            const operator = match.groups.operator.trim().toUpperCase().replace(" ", "");
            let raw_value = match.groups.value.trim();
           
            // Handle IN/NOT IN cases with multiple values
            if (operator === 'IN' || operator === 'NOTIN') {
                if (raw_value.startsWith('(') && raw_value.endsWith(')')) {
                    // Extract values within parentheses and split by commas
                    const values_list = raw_value.slice(1, -1).split(',').map(v => v.trim().replace(/["']/g, ''));
                    raw_value = values_list;
                } else {
                    // Single value case
                    raw_value = [raw_value.replace(/["']/g, '')];
                }
            } else {
                // Handle single value for other operators
                raw_value = raw_value.replace(/["']/g, '');
                if (operator === '>' || operator === '>=' || operator === '<' || operator === '<=') {
                    raw_value = raw_value.includes('.') ? parseFloat(raw_value) : parseInt(raw_value);
                }
            }

            key.push([field, operator]);
            values.push(raw_value);
            console.log(`Processed: field=${field}, operator=${operator}, value=${JSON.stringify(raw_value)}`);
        }

        const Dic_Mandatory_Fields = {};
        key.forEach((k, i) => {
            Dic_Mandatory_Fields[key[i]] = values[i];
        });
        
        let index_name = "default-index";
        for (const [k, op] of key) {
            if (k === "index" && op === "=") {
                index_name = Dic_Mandatory_Fields[[k, op]];
                break;
            }
        }

        const additional_fields = [];
        const must_not_conditions = [];

        for (const [k, op] of key) {
            const v = Dic_Mandatory_Fields[[k, op]];
            if (k !== "index") {
                if (typeof v === 'string' && v.includes('*')) {
                    additional_fields.push({"wildcard": {[k]: v}});
                } else if (op === "=") {
                    additional_fields.push({"term": {[k]: v}});
                } else if (op === "!=") {
                    must_not_conditions.push({"term": {[k]: v}});
                } else if (op === ">") {
                    additional_fields.push({"range": {[k]: {"gt": v}}});
                } else if (op === ">=") {
                    additional_fields.push({"range": {[k]: {"gte": v}}});
                } else if (op === "<") {
                    additional_fields.push({"range": {[k]: {"lt": v}}});
                } else if (op === "<=") {
                    additional_fields.push({"range": {[k]: {"lte": v}}});
                } else if (op === "IN") {
                    additional_fields.push({"terms": {[k]: Array.isArray(v) ? v : [v]}});
                } else if (op === "NOTIN") {
                    must_not_conditions.push({"terms": {[k]: Array.isArray(v) ? v : [v]}});
                }
            }
        }

        // Create base query without must_not
        const opensearch_query = {
            "size": 0,
            "query": {
                "bool": {
                    "must": additional_fields.length ? additional_fields : [{"match_all": {}}]
                }
            },
            "aggs": {}
        };
       
        // Only add must_not if there are conditions
        if (must_not_conditions.length) {
            opensearch_query.query.bool.must_not = must_not_conditions;
        }
       
        if (metric_clauses.length) {
            if (by_clause_fields.length) {
                let current = opensearch_query.aggs;
                for (const field of by_clause_fields) {
                    current[field] = {
                        "terms": {"field": field},
                        "aggs": {}
                    };
                    current = current[field].aggs;
                }

                for (const metric of metric_clauses) {
                    const function_name = metric.function.toLowerCase();
                    const field = metric.field;
                    const alias = metric.alias;
                   
                    if (function_name === "count") {
                        current[alias] = {"value_count": {"field": field}};
                    } else if (["max", "min", "avg", "sum"].includes(function_name)) {
                        current[alias] = {[function_name]: {"field": field}};
                    } else if (function_name === "percentile" || function_name.includes("perc")) {
                        current[alias] = {"percentiles": {"field": field, "percents": [percentile_number || 50]}};
                    } else if (function_name === "median") {
                        current[alias] = {"percentiles": {"field": field, "percents": [50]}};
                    } else if (function_name === "dc") {
                        current[alias] = {"cardinality": {"field": field}};
                    }
                }
            } else {
                for (const metric of metric_clauses) {
                    const function_name = metric.function.toLowerCase();
                    const field = metric.field;
                    const alias = metric.alias;

                    if (function_name === "count") {
                        opensearch_query.aggs[alias] = {"value_count": {"field": field}};
                    } else if (["max", "min", "avg", "sum"].includes(function_name)) {
                        opensearch_query.aggs[alias] = {[function_name]: {"field": field}};
                    } else if (function_name === "percentile" || function_name.includes("perc")) {
                        opensearch_query.aggs[alias] = {"percentiles": {"field": field, "percents": [percentile_number || 50]}};
                    } else if (function_name === "median") {
                        opensearch_query.aggs[alias] = {"percentiles": {"field": field, "percents": [50]}};
                    } else if (function_name === "dc") {
                        opensearch_query.aggs[alias] = {"cardinality": {"field": field}};
                    }
                }
            }
        }
       
        console.log("Final opensearch_query:", opensearch_query);
        return [index_name, opensearch_query];
    }

    function formatOutput(convertedQuery) {
        try {
            // Try to extract JSON part for pretty formatting
            const jsonStart = convertedQuery.indexOf('{');
            if (jsonStart > -1) {
		const postHeader = convertedQuery.substring(0, jsonStart).trim();
                const jsonPart = convertedQuery.slice(jsonStart);
                const jsonObj = JSON.parse(jsonPart);
                return {
                    raw: jsonPart, // Raw shows just the JSON
                    json: convertedQuery // Formatted shows complete output with headers
                };
            }
 // Fallback if no JSON found
            return {
                raw: convertedQuery,
                json: convertedQuery
            };
        } catch (e) {
            console.error("Error parsing JSON:", e);
        }
        
        return {
            raw: convertedQuery,
            json: { error: "Invalid JSON format", original: convertedQuery }
        };
    }

    function syntaxHighlight(json) {
        if (typeof json === 'string') {
            try { json = JSON.parse(json); }
            catch (e) { return `<span class="text-danger">${json}</span>`; }
        }
        
        const jsonStr = JSON.stringify(json, null, 2)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        return jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, 
            function(match) {
                let cls = 'token punctuation';
                if (/^"/.test(match)) {
                    cls = /:$/.test(match) ? 'token key' : 'token string';
                } else if (/true|false/.test(match)) {
                    cls = 'token boolean';
                } else if (/null/.test(match)) {
                    cls = 'token null';
                } else if (!isNaN(parseFloat(match))) {
                    cls = 'token number';
                }
                return `<span class="${cls}">${match}</span>`;
            });
    }

    function setLoading(isLoading) {
        convertBtn.disabled = isLoading;
        convertBtn.innerHTML = isLoading
            ? '<i class="fas fa-spinner fa-spin me-1"></i> Converting'
            : '<i class="fas fa-exchange-alt me-1"></i> Convert';
    }

    function showStatus(message, type) {
        statusIndicator.textContent = message;
        statusIndicator.className = `status-indicator text-${type}`;
    }

    // Copy functionality
    copyBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.tab-pane.active');
        const textToCopy = activeTab.querySelector('pre').textContent;
        
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check me-1"></i> Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                }, 2000);
            })
            .catch(err => {
                showStatus('Copy failed', 'error');
                console.error('Copy failed:', err);
            });
    });

    // Ctrl+Enter shortcut for conversion
    splQuery.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.key === 'Enter') {
            convertBtn.click();
        }
    });
});
