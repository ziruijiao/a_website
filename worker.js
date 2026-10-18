// ============================================================
//  焦梓睿的个人网站 - Cloudflare Workers 后端
//  部署：CF Workers + KV 存储
//  环境变量：ADMIN_PWD（管理密码）、JZR_KEY（加密密钥）
//  KV 绑定：ARTICLES_KV（文章数据）
// ============================================================

// ========== JZR v1.0 加密算法（内联，适配 Workers）==========
const JZR = (function() {
    var DEFAULT_KEY = 'jiaozirui2025';
    var MAGIC = 'JZR1:';

    function strToBytes(str) {
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
        var bytes = [];
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c < 128) bytes.push(c);
            else if (c < 2048) { bytes.push(192 | (c >> 6)); bytes.push(128 | (c & 63)); }
            else { bytes.push(224 | (c >> 12)); bytes.push(128 | ((c >> 6) & 63)); bytes.push(128 | (c & 63)); }
        }
        return new Uint8Array(bytes);
    }

    function bytesToStr(bytes) {
        if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
        var str = '', i = 0;
        while (i < bytes.length) {
            var c = bytes[i++];
            if (c > 127) {
                if (c > 191 && c < 224) { var c1 = bytes[i++]; c = ((c & 31) << 6) | (c1 & 63); }
                else { var c1 = bytes[i++], c2 = bytes[i++]; c = ((c & 15) << 12) | ((c1 & 63) << 6) | (c2 & 63); }
            }
            str += String.fromCharCode(c);
        }
        return str;
    }

    function b64Encode(bytes) {
        if (typeof btoa !== 'undefined') {
            var bin = '';
            for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            return btoa(bin);
        }
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var result = '', i = 0;
        while (i < bytes.length) {
            var b1 = bytes[i++], b2 = i < bytes.length ? bytes[i++] : -1, b3 = i < bytes.length ? bytes[i++] : -1;
            result += chars[b1 >> 2];
            result += chars[((b1 & 3) << 4) | (b2 >= 0 ? b2 >> 4 : 0)];
            result += b2 >= 0 ? chars[((b2 & 15) << 2) | (b3 >= 0 ? b3 >> 6 : 0)] : '=';
            result += b3 >= 0 ? chars[b3 & 63] : '=';
        }
        return result;
    }

    function b64Decode(str) {
        if (typeof atob !== 'undefined') {
            var bin = atob(str);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return bytes;
        }
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var lookup = {};
        for (var i = 0; i < chars.length; i++) lookup[chars[i]] = i;
        str = str.replace(/[^A-Za-z0-9+/=]/g, '');
        var bytes = [], i = 0;
        while (i < str.length) {
            var c1 = lookup[str[i++]], c2 = lookup[str[i++]], c3 = str[i] === '=' ? -1 : lookup[str[i++]], c4 = str[i] === '=' ? -1 : lookup[str[i++]];
            bytes.push((c1 << 2) | (c2 >> 4));
            if (c3 >= 0) bytes.push(((c2 & 15) << 4) | (c3 >> 2));
            if (c4 >= 0) bytes.push(((c3 & 3) << 6) | c4);
        }
        return new Uint8Array(bytes);
    }

    function permFwd(i) { return (i * 7 + 13) % 64; }
    function permRev(i) { return (((i - 13 + 64) % 64) * 55) % 64; }
    function charFwd(ch) {
        var idx = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(ch);
        return idx === -1 ? ch : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[permFwd(idx)];
    }
    function charRev(ch) {
        var idx = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(ch);
        return idx === -1 ? ch : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[permRev(idx)];
    }

    function encrypt(obj, keyStr) {
        keyStr = keyStr || DEFAULT_KEY;
        var bytes = strToBytes(JSON.stringify(obj));
        var keyBytes = strToBytes(keyStr);
        for (var i = 0; i < bytes.length; i++) bytes[i] = ((bytes[i] ^ keyBytes[i % keyBytes.length]) + (i % 256)) % 256;
        var encoded = b64Encode(bytes), result = '';
        for (var j = 0; j < encoded.length; j++) result += charFwd(encoded[j]);
        return MAGIC + result;
    }

    function decrypt(cipher, keyStr) {
        keyStr = keyStr || DEFAULT_KEY;
        if (typeof cipher !== 'string' || cipher.indexOf(MAGIC) !== 0) throw new Error('无效代码：缺少 JZR1 前缀');
        var shuffled = cipher.substring(MAGIC.length), encoded = '';
        for (var i = 0; i < shuffled.length; i++) encoded += charRev(shuffled[i]);
        var bytes = b64Decode(encoded), keyBytes = strToBytes(keyStr);
        for (var j = 0; j < bytes.length; j++) bytes[j] = ((bytes[j] - (j % 256) + 256) % 256) ^ keyBytes[j % keyBytes.length];
        return JSON.parse(bytesToStr(bytes));
    }

    return { encrypt: encrypt, decrypt: decrypt, DEFAULT_KEY: DEFAULT_KEY };
})();

// ========== 从 KV 读取密钥配置 ==========
async function getSecrets(env) {
    var defaults = { ADMIN_PWD: env.ADMIN_PWD || 'jiaozirui2025', JZR_KEY: env.JZR_KEY || 'jiaozirui2025' };
    if (!env.ARTICLES_KV || typeof env.ARTICLES_KV.get !== 'function') return defaults;
    try {
        var raw = await env.ARTICLES_KV.get('config');
        if (raw) {
            var cfg = JSON.parse(raw);
            if (cfg.ADMIN_PWD) defaults.ADMIN_PWD = cfg.ADMIN_PWD;
            if (cfg.JZR_KEY) defaults.JZR_KEY = cfg.JZR_KEY;
        }
    } catch (e) { /* KV 无 config 时用环境变量默认值 */ }
    return defaults;
}
function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' }
    });
}

function genToken() {
    var arr = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (var i = 0; i < 32; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// 内存中的有效 token（Worker 可能有多个实例，token 存在内存中；
// 生产环境建议存在 KV 里，这里简化处理）
var validTokens = new Set();

// ========== 文章 KV 操作 ==========
async function getArticles(env) {
    if (!env.ARTICLES_KV || typeof env.ARTICLES_KV.get !== 'function') return [];
    var raw = await env.ARTICLES_KV.get('articles');
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (e) { return []; }
}

async function saveArticles(env, articles) {
    if (!env.ARTICLES_KV || typeof env.ARTICLES_KV.put !== 'function') {
        throw new Error('未绑定 ARTICLES_KV，无法保存文章');
    }
    await env.ARTICLES_KV.put('articles', JSON.stringify(articles));
}

// ========== 主入口 ==========
export default {
    async fetch(request, env, ctx) {
        var url = new URL(request.url);
        var path = url.pathname;
        var method = request.method;

        // CORS 预检
        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' } });
        }

        // 静态文件交给 Worker Assets
        if (path.indexOf('/api/') !== 0) {
            if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
                return env.ASSETS.fetch(request);
            }
            return new Response('Not Found', { status: 404 });
        }

        var token = request.headers.get('X-Admin-Token') || '';
        var isAuthed = validTokens.has(token);

        try {
            // 从 KV 读取密钥配置
            var secrets = await getSecrets(env);
            var adminPwd = secrets.ADMIN_PWD;
            var jzrKey = secrets.JZR_KEY;

            // ===== 公开 API =====

            // 投稿加密
            if (path === '/api/encrypt' && method === 'POST') {
                var body = await request.json();
                if (!body.title || !body.content) return jsonResponse({ ok: false, error: '标题和内容不能为空' }, 400);
                var obj = { title: body.title, date: body.date || '', content: body.content, author: body.author || '匿名', t: Date.now() };
                var code = JZR.encrypt(obj, jzrKey);
                return jsonResponse({ ok: true, code: code });
            }

            // 登录
            if (path === '/api/login' && method === 'POST') {
                var loginBody = await request.json();
                if (loginBody.password === adminPwd) {
                    var newToken = genToken();
                    validTokens.add(newToken);
                    return jsonResponse({ ok: true, token: newToken });
                }
                return jsonResponse({ ok: false, error: '密码错误' }, 401);
            }

            // 获取文章列表
            if (path === '/api/articles' && method === 'GET') {
                var articles = await getArticles(env);
                return jsonResponse({ ok: true, articles: articles });
            }

            // ===== 需要鉴权的 API =====

            // 解密投稿
            if (path === '/api/decrypt' && method === 'POST') {
                if (!isAuthed) return jsonResponse({ ok: false, error: '未登录' }, 401);
                var decBody = await request.json();
                if (!decBody.code) return jsonResponse({ ok: false, error: '加密代码不能为空' }, 400);
                try {
                    var data = JZR.decrypt(decBody.code, jzrKey);
                    return jsonResponse({ ok: true, data: data });
                } catch (e) {
                    return jsonResponse({ ok: false, error: '解密失败：' + e.message }, 400);
                }
            }

            // 新增文章
            if (path === '/api/article' && method === 'POST') {
                if (!isAuthed) return jsonResponse({ ok: false, error: '未登录' }, 401);
                var addBody = await request.json();
                if (!addBody.title || !addBody.content) return jsonResponse({ ok: false, error: '标题和内容不能为空' }, 400);
                var arts = await getArticles(env);
                arts.push({ title: addBody.title, date: addBody.date || '', content: addBody.content });
                await saveArticles(env, arts);
                return jsonResponse({ ok: true, index: arts.length - 1 });
            }

            // 删除文章
            var delMatch = path.match(/^\/api\/article\/(\d+)$/);
            if (delMatch && method === 'DELETE') {
                if (!isAuthed) return jsonResponse({ ok: false, error: '未登录' }, 401);
                var idx = parseInt(delMatch[1], 10);
                var arts2 = await getArticles(env);
                if (idx < 0 || idx >= arts2.length) return jsonResponse({ ok: false, error: '文章不存在' }, 404);
                arts2.splice(idx, 1);
                await saveArticles(env, arts2);
                return jsonResponse({ ok: true });
            }

            // 登出
            if (path === '/api/logout' && method === 'POST') {
                validTokens.delete(token);
                return jsonResponse({ ok: true });
            }

            return jsonResponse({ ok: false, error: 'API 不存在' }, 404);

        } catch (e) {
            return jsonResponse({ ok: false, error: e.message }, 500);
        }
    }
};
