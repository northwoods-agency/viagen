/**
 * File editor module — extracted from ui.ts.
 * Returns { css, html, js } strings to be slotted into the chat UI template.
 */
export function buildEditorModule(): { css: string; html: string; js: string } {
  const css = `
    /* ── Prism overrides for viagen dark theme ── */
    pre[class*="language-"], code[class*="language-"] {
      color: #d4d4d8;
      background: none;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      line-height: 1.6;
      tab-size: 2;
      white-space: pre;
      word-break: normal;
      word-wrap: normal;
    }
    .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #6b7280; font-style: italic; }
    .token.punctuation { color: #a1a1aa; }
    .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol { color: #f9a8d4; }
    .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin { color: #86efac; }
    .token.operator, .token.entity, .token.url { color: #93c5fd; }
    .token.atrule, .token.attr-value, .token.keyword { color: #c4b5fd; }
    .token.function, .token.class-name { color: #fde68a; }
    .token.regex, .token.important, .token.variable { color: #fca5a5; }

    /* ── File tree ── */
    .file-tree { padding: 4px 0; }
    .tree-item {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      color: #a1a1aa;
      cursor: pointer;
      transition: background 0.1s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: none;
    }
    .tree-item:hover { background: #18181b; color: #e4e4e7; }
    .tree-item.active { background: #1e1e22; color: #e4e4e7; }
    .tree-arrow {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      font-size: 8px;
      color: #52525b;
      transition: transform 0.15s;
    }
    .tree-arrow.expanded { transform: rotate(90deg); }
    .tree-arrow.hidden { visibility: hidden; }
    .tree-icon {
      flex-shrink: 0;
      margin-right: 6px;
      font-size: 10px;
      color: #52525b;
    }
    .tree-label {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── Editor layout ── */
    .editor-split {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .editor-tree-pane {
      overflow-y: auto;
      border-right: 1px solid #27272a;
      flex-shrink: 0;
    }
    .editor-main-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .editor-header {
      padding: 8px 12px;
      border-bottom: 1px solid #27272a;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      background: #18181b;
    }
    .editor-back {
      background: none;
      border: none;
      color: #a1a1aa;
      font-size: 16px;
      cursor: pointer;
      padding: 2px 6px;
      line-height: 1;
    }
    .editor-back:hover { color: #e4e4e7; }
    .editor-filename {
      flex: 1;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      color: #d4d4d8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .editor-code-wrap {
      flex: 1;
      position: relative;
      overflow: hidden;
    }
    .editor-line-numbers {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 40px;
      padding: 8px 8px 8px 0;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre;
      color: #3f3f46;
      text-align: right;
      user-select: none;
      pointer-events: none;
      overflow: hidden;
      background: #0a0a0c;
      border-right: 1px solid #1e1e22;
      z-index: 2;
    }
    .editor-highlight {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 8px 12px 8px 48px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      line-height: 1.6;
      tab-size: 2;
      white-space: pre;
      overflow: auto;
      color: #d4d4d8;
      background: #09090b;
      margin: 0;
      border: none;
      z-index: 0;
    }
    .editor-highlight code {
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      background: none;
      padding: 0;
    }
    .editor-textarea {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      padding: 8px 12px 8px 48px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      line-height: 1.6;
      tab-size: 2;
      white-space: pre;
      overflow: auto;
      background: transparent;
      color: transparent;
      caret-color: #e4e4e7;
      border: none;
      resize: none;
      outline: none;
      z-index: 1;
    }
    .editor-image-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: #09090b;
      overflow: auto;
    }
    .editor-image-wrap img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 4px;
    }
  `;

  const html = `
    <div id="files-view" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
      <div class="editor-split" id="editor-split">
        <div class="editor-tree-pane" id="editor-tree-pane">
          <div class="file-tree" id="file-tree"></div>
        </div>
        <div class="editor-main-pane" id="editor-main-pane" style="display:none;">
          <div class="editor-header">
            <button class="editor-back" id="editor-back" title="Back to files">&#x2190;</button>
            <span class="editor-filename" id="editor-filename"></span>
            <button class="btn" id="editor-save" disabled>Save</button>
          </div>
          <div class="editor-code-wrap" id="editor-code-wrap">
            <div class="editor-line-numbers" id="editor-line-numbers"></div>
            <pre class="editor-highlight" id="editor-highlight"><code id="editor-code"></code></pre>
            <textarea id="editor-textarea" class="editor-textarea" spellcheck="false"></textarea>
          </div>
          <div class="editor-image-wrap" id="editor-image-wrap" style="display:none;">
            <img id="editor-image" />
          </div>
        </div>
      </div>
    </div>
  `;

  const js = `
    (function() {
      var IMAGE_EXTS = ['png','jpg','jpeg','gif','svg','webp','ico','bmp'];
      var LANG_MAP = {
        ts: 'typescript', tsx: 'typescript',
        js: 'javascript', jsx: 'javascript',
        css: 'css', scss: 'css',
        html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup',
        json: 'json',
        md: 'markdown',
      };

      var treePane = document.getElementById('editor-tree-pane');
      var mainPane = document.getElementById('editor-main-pane');
      var editorSplit = document.getElementById('editor-split');
      var fileTree = document.getElementById('file-tree');
      var editorTextarea = document.getElementById('editor-textarea');
      var editorHighlight = document.getElementById('editor-highlight');
      var editorCode = document.getElementById('editor-code');
      var lineNumbersEl = document.getElementById('editor-line-numbers');
      var codeWrap = document.getElementById('editor-code-wrap');
      var imageWrap = document.getElementById('editor-image-wrap');
      var editorImage = document.getElementById('editor-image');
      var editorSave = document.getElementById('editor-save');
      var editorFilename = document.getElementById('editor-filename');
      var editorBack = document.getElementById('editor-back');

      var editorState = { path: '', original: '', modified: false, lang: '' };
      var expandedDirs = new Set();
      var activeFilePath = '';
      var isWideMode = false;

      function getExt(path) {
        var i = path.lastIndexOf('.');
        return i >= 0 ? path.slice(i + 1).toLowerCase() : '';
      }

      function isImage(path) {
        return IMAGE_EXTS.indexOf(getExt(path)) !== -1;
      }

      function getLang(path) {
        return LANG_MAP[getExt(path)] || '';
      }

      function checkWideMode() {
        var view = document.getElementById('files-view');
        isWideMode = view && view.offsetWidth >= 500;
      }

      /* ── Syntax highlighting ── */
      function highlightCode(text, lang) {
        if (typeof Prism !== 'undefined' && lang && Prism.languages[lang]) {
          return Prism.highlight(text, Prism.languages[lang], lang);
        }
        return escapeHtml(text);
      }

      function updateHighlight() {
        editorCode.innerHTML = highlightCode(editorTextarea.value, editorState.lang);
      }

      function updateLineNumbers() {
        var lines = editorTextarea.value.split('\\n').length;
        var nums = '';
        for (var i = 1; i <= lines; i++) nums += i + '\\n';
        lineNumbersEl.textContent = nums;
      }

      function syncScroll() {
        editorHighlight.scrollTop = editorTextarea.scrollTop;
        editorHighlight.scrollLeft = editorTextarea.scrollLeft;
        lineNumbersEl.scrollTop = editorTextarea.scrollTop;
      }

      /* ── Tree building ── */
      function buildTree(files) {
        var root = { name: '', children: {}, files: [] };
        files.forEach(function(f) {
          var parts = f.split('/');
          var node = root;
          for (var i = 0; i < parts.length - 1; i++) {
            var dirName = parts[i];
            if (!node.children[dirName]) {
              node.children[dirName] = { name: dirName, children: {}, files: [] };
            }
            node = node.children[dirName];
          }
          node.files.push({ name: parts[parts.length - 1], path: f });
        });
        return root;
      }

      function renderTree(node, container, depth, dirPath) {
        // Render subdirectories first
        var dirs = Object.keys(node.children).sort();
        dirs.forEach(function(dirName) {
          var child = node.children[dirName];
          var childPath = dirPath ? dirPath + '/' + dirName : dirName;
          var isExpanded = expandedDirs.has(childPath);

          var row = document.createElement('div');
          row.className = 'tree-item';
          row.style.paddingLeft = (8 + depth * 16) + 'px';
          row.innerHTML = '<span class="tree-arrow ' + (isExpanded ? 'expanded' : '') + '">&#x25B6;</span>' +
            '<span class="tree-icon">&#x1F4C1;</span>' +
            '<span class="tree-label">' + escapeHtml(dirName) + '</span>';
          container.appendChild(row);

          var childContainer = document.createElement('div');
          childContainer.style.display = isExpanded ? 'block' : 'none';
          container.appendChild(childContainer);

          row.addEventListener('click', function() {
            if (expandedDirs.has(childPath)) {
              expandedDirs.delete(childPath);
              childContainer.style.display = 'none';
              row.querySelector('.tree-arrow').classList.remove('expanded');
            } else {
              expandedDirs.add(childPath);
              childContainer.style.display = 'block';
              row.querySelector('.tree-arrow').classList.add('expanded');
            }
          });

          renderTree(child, childContainer, depth + 1, childPath);
        });

        // Render files
        node.files.sort(function(a, b) { return a.name.localeCompare(b.name); });
        node.files.forEach(function(file) {
          var row = document.createElement('div');
          row.className = 'tree-item' + (file.path === activeFilePath ? ' active' : '');
          row.style.paddingLeft = (8 + depth * 16) + 'px';
          row.dataset.path = file.path;
          row.innerHTML = '<span class="tree-arrow hidden">&#x25B6;</span>' +
            '<span class="tree-icon" style="color:#52525b;">&#x25A1;</span>' +
            '<span class="tree-label">' + escapeHtml(file.name) + '</span>';
          row.addEventListener('click', function() { openFile(file.path); });
          container.appendChild(row);
        });
      }

      function renderFileTree(files) {
        fileTree.innerHTML = '';
        if (files.length === 0) {
          fileTree.innerHTML = '<div style="padding:16px;color:#52525b;font-size:12px;">No editable files configured</div>';
          return;
        }
        // Default: expand all directories
        if (expandedDirs.size === 0) {
          files.forEach(function(f) {
            var parts = f.split('/');
            var path = '';
            for (var i = 0; i < parts.length - 1; i++) {
              path = path ? path + '/' + parts[i] : parts[i];
              expandedDirs.add(path);
            }
          });
        }
        var tree = buildTree(files);
        renderTree(tree, fileTree, 0, '');
      }

      /* ── File loading ── */
      var cachedFiles = null;
      window._viagenLoadFiles = loadFileList;

      async function loadFileList() {
        checkWideMode();
        updateLayout(false);

        fileTree.innerHTML = '<div style="padding:16px;color:#52525b;font-size:12px;font-family:ui-monospace,monospace;">Loading...</div>';
        try {
          var res = await fetch('/via/files');
          var data = await res.json();
          cachedFiles = data.files;
          renderFileTree(data.files);
        } catch(e) {
          fileTree.innerHTML = '<div style="padding:16px;color:#f87171;font-size:12px;">Failed to load files</div>';
        }
      }

      function updateLayout(showEditor) {
        checkWideMode();
        if (isWideMode) {
          treePane.style.display = 'block';
          treePane.style.width = '200px';
          mainPane.style.display = showEditor ? 'flex' : 'none';
          editorBack.style.display = 'none';
        } else {
          if (showEditor) {
            treePane.style.display = 'none';
            mainPane.style.display = 'flex';
            editorBack.style.display = '';
          } else {
            treePane.style.display = 'block';
            treePane.style.width = '100%';
            mainPane.style.display = 'none';
          }
        }
      }

      function setActiveInTree(path) {
        activeFilePath = path;
        var items = fileTree.querySelectorAll('.tree-item');
        for (var i = 0; i < items.length; i++) {
          items[i].classList.toggle('active', items[i].dataset.path === path);
        }
      }

      async function openFile(path) {
        setActiveInTree(path);
        editorFilename.textContent = path;
        editorSave.disabled = true;
        editorSave.textContent = 'Save';

        if (isImage(path)) {
          codeWrap.style.display = 'none';
          imageWrap.style.display = 'flex';
          editorImage.src = '/via/file/raw?path=' + encodeURIComponent(path);
          editorSave.style.display = 'none';
          editorState = { path: path, original: '', modified: false, lang: '' };
        } else {
          codeWrap.style.display = '';
          imageWrap.style.display = 'none';
          editorSave.style.display = '';
          var lang = getLang(path);
          editorState = { path: path, original: '', modified: false, lang: lang };

          try {
            var res = await fetch('/via/file?path=' + encodeURIComponent(path));
            var data = await res.json();
            editorState.original = data.content;
            editorTextarea.value = data.content;
            updateLineNumbers();
            updateHighlight();
          } catch(e) {
            editorTextarea.value = '// Error loading file';
            updateLineNumbers();
            updateHighlight();
          }
        }

        updateLayout(true);
      }

      /* ── Edit tracking ── */
      function markModified() {
        editorState.modified = (editorTextarea.value !== editorState.original);
        editorSave.disabled = !editorState.modified;
      }

      editorTextarea.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
          e.preventDefault();
          var start = this.selectionStart;
          var end = this.selectionEnd;
          this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
          this.selectionStart = this.selectionEnd = start + 2;
          updateLineNumbers();
          updateHighlight();
          markModified();
        }
      });

      editorTextarea.addEventListener('input', function() {
        updateLineNumbers();
        updateHighlight();
        markModified();
      });

      editorTextarea.addEventListener('scroll', syncScroll);

      /* ── Save ── */
      editorSave.addEventListener('click', async function() {
        editorSave.disabled = true;
        editorSave.textContent = 'Saving...';
        var content = editorTextarea.value;
        try {
          var res = await fetch('/via/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: editorState.path, content: content }),
          });
          var data = await res.json();
          if (data.status === 'ok') {
            editorState.original = content;
            editorState.modified = false;
            editorSave.textContent = 'Saved';
            setTimeout(function() { editorSave.textContent = 'Save'; }, 1500);
          } else {
            editorSave.textContent = 'Error';
            setTimeout(function() { editorSave.textContent = 'Save'; editorSave.disabled = false; }, 2000);
          }
        } catch(e) {
          editorSave.textContent = 'Error';
          setTimeout(function() { editorSave.textContent = 'Save'; editorSave.disabled = false; }, 2000);
        }
      });

      /* ── Back button ── */
      editorBack.addEventListener('click', function() {
        if (editorState.modified) {
          if (!confirm('Discard unsaved changes?')) return;
        }
        activeFilePath = '';
        updateLayout(false);
        if (cachedFiles) renderFileTree(cachedFiles);
      });

    })();
  `;

  return { css, html, js };
}
