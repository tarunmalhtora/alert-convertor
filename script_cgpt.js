document.addEventListener('DOMContentLoaded', function () {
    const convertBtn = document.getElementById('convertBtn');
    const copyBtn = document.getElementById('copyBtn');
    const splQuery = document.getElementById('splQuery');
    const jsonResult = document.getElementById('jsonResult');
    const rawResult = document.getElementById('rawResult');
    const statusIndicator = document.getElementById('statusIndicator');

    // SPL → DSL Conversion (Simple Demo)
    function convertSplToDsl(spl) {
        // Replace with your real logic. This is a dummy parser.
        if (!spl || !spl.trim()) return JSON.stringify({ error: "No SPL provided." }, null, 2);

        // Example: convert "index=myindex | stats count by host"
        if (spl.includes("stats") && spl.includes("by")) {
            const match = spl.match(/stats\s+(.*)\s+by\s+(.*)/i);
            if (match) {
                const metric = match[1].trim();
                const groupBy = match[2].trim();
                return JSON.stringify({
                    size: 0,
                    aggs: {
                        group_by: {
                            terms: { field: groupBy },
                            aggs: {
                                [`${metric}_agg`]: {
                                    value_count: { field: metric }
                                }
                            }
                        }
                    }
                }, null, 2);
            }
        }

        return JSON.stringify({ note: "Conversion placeholder", originalSPL: spl }, null, 2);
    }

    convertBtn.addEventListener('click', () => {
        const spl = splQuery.value.trim();
        if (!spl) {
            showStatus('Please enter a query', 'error');
            return;
        }

        showStatus('Converting...', 'processing');
        setLoading(true);

        try {
            const converted = convertSplToDsl(spl);
            rawResult.textContent = converted;

            try {
                const jsonData = JSON.parse(converted);
                jsonResult.innerHTML = syntaxHighlight(jsonData);
                showStatus('Conversion successful', 'success');
            } catch (e) {
                jsonResult.innerHTML = syntaxHighlight({
                    message: 'Could not parse as JSON',
                    rawOutput: converted
                });
                showStatus('Converted (raw)', 'warning');
            }
        } catch (err) {
            showStatus(`Error: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        convertBtn.disabled = isLoading;
        convertBtn.innerHTML = isLoading
            ? '<i class="fas fa-spinner fa-spin me-1"></i> Converting'
            : '<i class="fas fa-sync-alt me-1"></i> Convert';
    }

    function showStatus(message, type) {
        statusIndicator.textContent = message;
        statusIndicator.className = `status-indicator text-${type}`;
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

        return jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|\d+)/g,
            function (match) {
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

    copyBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.tab-pane.active pre');
        if (!activeTab) return;

        navigator.clipboard.writeText(activeTab.textContent)
            .then(() => {
                const original = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check me-1"></i> Copied!';
                setTimeout(() => copyBtn.innerHTML = original, 2000);
            })
            .catch(err => {
                showStatus('Copy failed', 'error');
                console.error(err);
            });
    });

    splQuery.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.key === 'Enter') {
            convertBtn.click();
        }
    });
});
