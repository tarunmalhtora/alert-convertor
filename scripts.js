function convert() {
    const spl = document.getElementById("splInput").value;
    const opensearchQuery = splToOpenSearch(spl);
    document.getElementById("output").textContent = opensearchQuery;
}

function splToOpenSearch(spl) {
    if (spl.includes("index=")) {
        let query = { query: { bool: { must: [] } } };
        let index = spl.match(/index=([^\s]+)/)[1];
        let searchTerm = spl.split("|")[0].replace(/index=[^\s]*\s*/, "").trim();

        // Add index to query (index should be specified separately in OpenSearch)
        query.index = index;

        // Handle the search term (basic implementation)
        if (searchTerm) {
            query.query.bool.must.push({ match: { message: searchTerm } });
        }

        // Implement stats conversion here (to be expanded)
        if (spl.includes("stats")) {
            let statsField = spl.match(/stats\s+count\s+by\s+([^\s]+)/)[1];
            query.aggregations = {
                [statsField]: {
                    value_count: {
                        field: statsField
                    }
                }
            };
        }

        return JSON.stringify(query, null, 2); // Pretty print JSON
    }
    return "Conversion not implemented for this SPL.";
}
