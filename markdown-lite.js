(function () {
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderInline(text) {
    var escaped = escapeHtml(text);
    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/_(.+?)_/g, '<em>$1</em>');
    return escaped;
  }

  function parseList(items) {
    return '<ul>' + items.map(function (item) {
      return '<li>' + renderInline(item) + '</li>';
    }).join('') + '</ul>';
  }

  function parseOrderedList(items) {
    return '<ol>' + items.map(function (item) {
      return '<li>' + renderInline(item) + '</li>';
    }).join('') + '</ol>';
  }

  function parseMarkdown(md) {
    var source = String(md || '');
    if (!source.trim()) return '';

    var lines = source.replace(/\r\n/g, '\n').split('\n');
    var html = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        i += 1;
        continue;
      }

      if (/^```/.test(trimmed)) {
        var codeLines = [];
        i += 1;
        while (i < lines.length && !/^```/.test(lines[i].trim())) {
          codeLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1;
        html.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        var quoteLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          quoteLines.push(lines[i].replace(/^>\s?/, ''));
          i += 1;
        }
        html.push('<blockquote>' + renderInline(quoteLines.join('<br>')) + '</blockquote>');
        continue;
      }

      if (/^#{1,6}\s+/.test(trimmed)) {
        var level = trimmed.match(/^#+/)[0].length;
        html.push('<h' + level + '>' + renderInline(trimmed.replace(/^#{1,6}\s+/, '')) + '</h' + level + '>');
        i += 1;
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        var listItems = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          listItems.push(lines[i].replace(/^[-*]\s+/, '').trim());
          i += 1;
        }
        html.push(parseList(listItems));
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        var orderItems = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          orderItems.push(lines[i].replace(/^\d+\.\s+/, '').trim());
          i += 1;
        }
        html.push(parseOrderedList(orderItems));
        continue;
      }

      var paragraphLines = [];
      while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i].trim()) && !/^>\s?/.test(lines[i].trim()) && !/^#{1,6}\s+/.test(lines[i].trim()) && !/^[-*]\s+/.test(lines[i].trim()) && !/^\d+\.\s+/.test(lines[i].trim())) {
        paragraphLines.push(lines[i].trim());
        i += 1;
      }
      html.push('<p>' + renderInline(paragraphLines.join(' ')) + '</p>');
    }

    return html.join('');
  }

  window.markdownLite = {
    parse: parseMarkdown
  };
})();
