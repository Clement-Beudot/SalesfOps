function tableToCsv(columns, rows) {
    const esc = v => { const s = v == null ? '' : String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
    return [columns, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
}

function tableToTsv(columns, rows) {
    const esc = v => { const s = v == null ? '' : String(v); return s.includes('\t') || s.includes('\n') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    return [columns, ...rows].map(r => r.map(esc).join('\t')).join('\r\n');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { tableToCsv, tableToTsv };
}
