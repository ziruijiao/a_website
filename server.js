// ============================================================
//  焦梓睿的个人网站 - 后端服务（Node.js 零依赖）
//  功能：静态文件服务 + 文章管理 API + 投稿加密 + 管理鉴权
//  运行：node server.js
//  部署：zirui.riliwuhou.de5.net
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JZR = require('./jzw_crypto.js');

const PORT = 3000;
const ROOT = __dirname;
const ARTICLES_FILE = path.join(ROOT, 'articles.js');

// ========== 后端配置（从 secret.txt 读取，不硬编码）==========
function loadSecrets() {
  var secrets = { ADMIN_PWD: 'jiaozirui2025', JZR_KEY: 'jiaozirui2025' };
  try {
    var content = fs.readFileSync(path.join(ROOT, 'secret.txt'), 'utf-8');
    content.split(/\r?\n/).forEach(function(line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      var eq = line.indexOf('=');
      if (eq > 0) {
        var key = line.substring(0, eq).trim();
        var val = line.substring(eq + 1).trim();
        if (key && val) secrets[key] = val;
      }
    });
    console.log('[OK] 已从 secret.txt 加载密钥配置');
  } catch (e) {
    console.log('[WARN] 未找到 secret.txt，使用默认密钥（建议创建 secret.txt）');
  }
  return secrets;
}
var SECRETS = loadSecrets();
var ADMIN_PWD = SECRETS.ADMIN_PWD;
var JZR_KEY = SECRETS.JZR_KEY;

// 内存中的有效 token（服务重启后失效）
const validTokens = new Set();

// ========== MIME 类型 ==========
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};

// ========== 读取 articles.js，解析 articles 数组 ==========
function readArticles() {
  const content = fs.readFileSync(ARTICLES_FILE, 'utf-8');
  const match = content.match(/var\s+articles\s*=\s*\[([\s\S]*?)\];\s*$/m);
  if (!match) return [];
  try {
    const fn = new Function('var articles = [' + match[1] + ']; return articles;');
    return fn();
  } catch (e) {
    console.error('[ERROR] 解析 articles 失败:', e.message);
    return [];
  }
}

// ========== 将 articles 数组写回 articles.js ==========
function writeArticles(articles) {
  let content = fs.readFileSync(ARTICLES_FILE, 'utf-8');
  const arrStr = articles.map(function(a) {
    const title = (a.title || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const date = (a.date || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const c = (a.content || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    return '  {\n    title: "' + title + '",\n    date: "' + date + '",\n    content: `' + c + '`\n  }';
  }).join(',\n');
  const newContent = content.replace(
    /var\s+articles\s*=\s*\[([\s\S]*?)\];\s*$/m,
    'var articles = [\n' + arrStr + '\n];'
  );
  fs.writeFileSync(ARTICLES_FILE, newContent, 'utf-8');
  console.log('[OK] articles.js 已更新，共 ' + articles.length + ' 篇');
}

// ========== 工具函数 ==========
function parseBody(req) {
  return new Promise(function(resolve, reject) {
    let body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

function checkAuth(req) {
  const token = req.headers['x-admin-token'] || '';
  return token === ADMIN_PWD || validTokens.has(token);
}

// ========== 静态文件服务 ==========
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    sendJSON(res, 403, { ok: false, error: 'Forbidden' });
    return;
  }
  fs.stat(filePath, function(err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ========== 创建服务器 ==========
const server = http.createServer(async function(req, res) {
  const url = req.url.split('?')[0];
  const method = req.method;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    // ===== 公开 API =====

    // 投稿加密（公开，不需要登录）
    if (url === '/api/encrypt' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.title || !body.content) {
        sendJSON(res, 400, { ok: false, error: '标题和内容不能为空' });
        return;
      }
      const obj = {
        title: body.title,
        date: body.date || '',
        content: body.content,
        author: body.author || '匿名',
        t: Date.now()
      };
      const code = JZR.encrypt(obj, JZR_KEY);
      sendJSON(res, 200, { ok: true, code: code });
      return;
    }

    // 登录
    if (url === '/api/login' && method === 'POST') {
      const body = await parseBody(req);
      if (body.password === ADMIN_PWD) {
        const token = genToken();
        validTokens.add(token);
        sendJSON(res, 200, { ok: true, token: token });
      } else {
        sendJSON(res, 401, { ok: false, error: '密码错误' });
      }
      return;
    }

    // 获取文章列表（公开）
    if (url === '/api/articles' && method === 'GET') {
      sendJSON(res, 200, { ok: true, articles: readArticles() });
      return;
    }

    // ===== 需要鉴权的 API =====

    // 解密投稿
    if (url === '/api/decrypt' && method === 'POST') {
      if (!checkAuth(req)) { sendJSON(res, 401, { ok: false, error: '未登录' }); return; }
      const body = await parseBody(req);
      if (!body.code) { sendJSON(res, 400, { ok: false, error: '加密代码不能为空' }); return; }
      try {
        const data = JZR.decrypt(body.code, JZR_KEY);
        sendJSON(res, 200, { ok: true, data: data });
      } catch (e) {
        sendJSON(res, 400, { ok: false, error: '解密失败：' + e.message });
      }
      return;
    }

    // 新增文章
    if (url === '/api/article' && method === 'POST') {
      if (!checkAuth(req)) { sendJSON(res, 401, { ok: false, error: '未登录' }); return; }
      const body = await parseBody(req);
      if (!body.title || !body.content) {
        sendJSON(res, 400, { ok: false, error: '标题和内容不能为空' });
        return;
      }
      const articles = readArticles();
      articles.push({ title: body.title, date: body.date || '', content: body.content });
      writeArticles(articles);
      sendJSON(res, 200, { ok: true, index: articles.length - 1 });
      return;
    }

    // 删除文章
    const delMatch = url.match(/^\/api\/article\/(\d+)$/);
    if (delMatch && method === 'DELETE') {
      if (!checkAuth(req)) { sendJSON(res, 401, { ok: false, error: '未登录' }); return; }
      const index = parseInt(delMatch[1], 10);
      const articles = readArticles();
      if (index < 0 || index >= articles.length) {
        sendJSON(res, 404, { ok: false, error: '文章不存在' });
        return;
      }
      articles.splice(index, 1);
      writeArticles(articles);
      sendJSON(res, 200, { ok: true });
      return;
    }

    // 登出
    if (url === '/api/logout' && method === 'POST') {
      const token = req.headers['x-admin-token'] || '';
      validTokens.delete(token);
      sendJSON(res, 200, { ok: true });
      return;
    }

    // ===== 静态文件 =====
    serveStatic(req, res);

  } catch (e) {
    console.error('[ERROR]', e.message);
    sendJSON(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, function() {
  console.log('========================================');
  console.log('  焦梓睿的个人网站 - 后端服务已启动');
  console.log('========================================');
  console.log('  网站首页:  http://localhost:' + PORT);
  console.log('  管理后台:  http://localhost:' + PORT + '/admin.html');
  console.log('  部署地址:  zirui.riliwuhou.de5.net');
  console.log('========================================');
  console.log('  按 Ctrl+C 停止服务');
  console.log('========================================');
});
