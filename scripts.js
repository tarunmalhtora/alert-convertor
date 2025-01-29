function convertSplToOpenSearch(splQuery) {
    let openSearchQuery = {
        query: {
            bool: {
                must: []
            }
        }
    };

    // Basic conversion: If SPL contains "search", convert to OpenSearch match query
    if (splQuery.includes("search")) {
        let matchValue = splQuery.split("search ")[1].trim();
        openSearchQuery.query.bool.must.push({ match: { _all: matchValue } });
    }

    return JSON.stringify(openSearchQuery, null, 2);
}

// Event listener for Convert button
document.getElementById("convertBtn").addEventListener("click", function() {
    let splInput = document.getElementById("splInput").value;
    let osOutput = convertSplToOpenSearch(splInput);
    document.getElementById("osOutput").textContent = osOutput;
});

// Copy to clipboard function
document.getElementById("copyBtn").addEventListener("click", function() {
    let outputText = document.getElementById("osOutput").textContent;
    navigator.clipboard.writeText(outputText).then(() => {
        alert("Copied to clipboard!");
    });
});
