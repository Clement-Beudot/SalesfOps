// Shared markdown → HTML parser for documentation windows.
window.parseMarkdown = function parseMarkdown(md) {
    const lines = md.split('\n');
    let html = '';
    let i = 0;

    function escHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function inlineFormat(s) {
        s = escHtml(s);
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        return s;
    }

    // ── List helpers ──────────────────────────────────────────────────────────

    function isListLine(line) {
        return /^(\s*)([-*]|\d+\.)\s/.test(line);
    }
    function lineIndent(line) {
        return line.match(/^(\s*)/)[1].length;
    }
    function listTag(line) {
        return /^\s*\d+\./.test(line) ? 'ol' : 'ul';
    }
    function listContent(line) {
        return line.replace(/^\s*([-*]|\d+\.)\s+/, '');
    }

    function buildList(startI, minIndent) {
        let out = '';
        let j = startI;
        let openTag = null;

        while (j < lines.length) {
            const line = lines[j];
            if (line.trim() === '') break;
            if (!isListLine(line)) break;
            const ind = lineIndent(line);
            if (ind < minIndent) break;
            if (ind > minIndent) break; // consumed by nested call

            const tag = listTag(line);
            if (openTag !== tag) {
                if (openTag) out += `</${openTag}>\n`;
                out += `<${tag}>\n`;
                openTag = tag;
            }

            const content = inlineFormat(listContent(line));
            j++;

            // Check for nested list
            let nested = '';
            if (j < lines.length && lines[j].trim() !== '' && isListLine(lines[j])) {
                const nextInd = lineIndent(lines[j]);
                if (nextInd > minIndent) {
                    const [nestedHtml, newJ] = buildList(j, nextInd);
                    nested = nestedHtml;
                    j = newJ;
                }
            }

            out += `<li>${content}${nested}</li>\n`;
        }

        if (openTag) out += `</${openTag}>\n`;
        return [out, j];
    }

    // ── Main loop ─────────────────────────────────────────────────────────────

    while (i < lines.length) {
        const line = lines[i];

        // Fenced code block
        if (line.startsWith('```')) {
            i++;
            let code = '';
            while (i < lines.length && !lines[i].startsWith('```')) {
                code += escHtml(lines[i]) + '\n';
                i++;
            }
            i++;
            html += `<pre><code>${code.trimEnd()}</code></pre>\n`;
            continue;
        }

        // Headings (longest match first to avoid #### matching as ##)
        const h5m = line.match(/^##### (.+)/);
        const h4m = line.match(/^#### (.+)/);
        const h3m = line.match(/^### (.+)/);
        const h2m = line.match(/^## (.+)/);
        const h1m = line.match(/^# (.+)/);
        if (h5m) {
            const id = 'h5-' + h5m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
            html += `<h5 id="${id}">${inlineFormat(h5m[1])}</h5>\n`;
            i++; continue;
        }
        if (h4m) {
            const id = 'h4-' + h4m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
            html += `<h4 id="${id}">${inlineFormat(h4m[1])}</h4>\n`;
            i++; continue;
        }
        if (h3m) {
            const id = 'f-' + h3m[1].replace(/[^A-Za-z0-9]/g, '-').replace(/-+$/, '');
            html += `<h3 id="${id}">${inlineFormat(h3m[1])}</h3>\n`;
            i++; continue;
        }
        if (h2m) {
            const id = 's-' + h2m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
            html += `<h2 id="${id}">${inlineFormat(h2m[1])}</h2>\n`;
            i++; continue;
        }
        if (h1m) {
            const id = 'h1-' + h1m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
            html += `<h1 id="${id}">${inlineFormat(h1m[1])}</h1>\n`;
            i++; continue;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) { html += '<hr>\n'; i++; continue; }

        // Blockquote
        if (line.startsWith('> ')) {
            let inner = '';
            while (i < lines.length && lines[i].startsWith('> ')) {
                inner += inlineFormat(lines[i].slice(2)) + ' ';
                i++;
            }
            html += `<blockquote>${inner.trim()}</blockquote>\n`;
            continue;
        }

        // Table
        if (line.startsWith('|')) {
            let rows = [];
            while (i < lines.length && lines[i].startsWith('|')) {
                const cells = lines[i].split('|').slice(1, -1).map(c => c.trim());
                rows.push(cells);
                i++;
            }
            const isHeader = rows.length > 1 && rows[1].every(c => /^[-:]+$/.test(c));
            let table = '<table>\n';
            rows.forEach((cells, ri) => {
                if (isHeader && ri === 1) return;
                const tag = (isHeader && ri === 0) ? 'th' : 'td';
                table += '<tr>' + cells.map(c => `<${tag}>${inlineFormat(c)}</${tag}>`).join('') + '</tr>\n';
            });
            table += '</table>\n';
            html += table;
            continue;
        }

        // Lists (ordered and unordered, nested)
        if (isListLine(line) && lineIndent(line) === 0) {
            const [listHtml, newI] = buildList(i, 0);
            html += listHtml;
            i = newI;
            continue;
        }

        // Blank line
        if (line.trim() === '') { i++; continue; }

        // Paragraph
        html += `<p>${inlineFormat(line)}</p>\n`;
        i++;
    }
    return html;
};
