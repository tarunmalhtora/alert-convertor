function convertAlert() {
    const splunkAlert = document.getElementById('splunk-alert').value;
    let opensearchQuery = ''; // Placeholder for the conversion logic

    // Conversion logic goes here
    // For example:
    opensearchQuery = splunkAlert.replace(/some_regex_pattern/, 'opensearch_equivalent');

    document.getElementById('opensearch-query').value = opensearchQuery;
}
