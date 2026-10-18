// ============================================================
//  JZR 加密算法 v1.0  —  自创加密，用于文章投稿加密传输
//  加密流程：JSON序列化 → UTF8字节 → 密钥循环异或 → 位置混淆
//           → Base64编码 → 自定义字符置换 → 加版本前缀
//  解密流程：反向操作
// ============================================================

var JZR = (function () {
    var PREFIX = "JZR1:";
    var STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    // 默认密钥（可自行修改，加密和解密必须用同一个密钥）
    var DEFAULT_KEY = "jiaozirui2025";

    // ---- 自定义字符置换：基于模运算的索引映射（一一对应）----
    // 加密：索引 i → (i * 7 + 13) % 64
    // 解密：7 在 mod64 下的逆元是 55（7*55=385≡1 mod64）
    function permFwd(i) { return (i * 7 + 13) % 64; }
    function permRev(i) { return (((i - 13 + 64) % 64) * 55) % 64; }
    function charFwd(ch) {
        var idx = STD.indexOf(ch);
        return idx === -1 ? ch : STD[permFwd(idx)];
    }
    function charRev(ch) {
        var idx = STD.indexOf(ch);
        return idx === -1 ? ch : STD[permRev(idx)];
    }

    // ---- UTF-8 字符串 ↔ 字节数组 ----
    function strToBytes(str) {
        var bytes = [];
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c < 0x80) bytes.push(c);
            else if (c < 0x800) {
                bytes.push(0xc0 | (c >> 6));
                bytes.push(0x80 | (c & 0x3f));
            } else {
                bytes.push(0xe0 | (c >> 12));
                bytes.push(0x80 | ((c >> 6) & 0x3f));
                bytes.push(0x80 | (c & 0x3f));
            }
        }
        return bytes;
    }
    function bytesToStr(bytes) {
        var str = "";
        for (var i = 0; i < bytes.length;) {
            var b = bytes[i];
            if (b < 0x80) { str += String.fromCharCode(b); i++; }
            else if (b < 0xe0) {
                str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
                i += 2;
            } else {
                str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
                i += 3;
            }
        }
        return str;
    }

    // ---- Base64 编码/解码（字节数组版）----
    function b64Encode(bytes) {
        var r = "";
        for (var i = 0; i < bytes.length; i += 3) {
            var b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
            r += STD[b0 >> 2];
            r += STD[((b0 & 3) << 4) | (b1 >> 4)];
            r += (i + 1 < bytes.length) ? STD[((b1 & 0xf) << 2) | (b2 >> 6)] : "=";
            r += (i + 2 < bytes.length) ? STD[b2 & 0x3f] : "=";
        }
        return r;
    }
    function b64Decode(str) {
        var bytes = [];
        str = str.replace(/=+$/, "");
        for (var i = 0; i < str.length; i += 4) {
            var c0 = STD.indexOf(str[i]), c1 = STD.indexOf(str[i + 1]);
            var c2 = (i + 2 < str.length) ? STD.indexOf(str[i + 2]) : -1;
            var c3 = (i + 3 < str.length) ? STD.indexOf(str[i + 3]) : -1;
            bytes.push((c0 << 2) | (c1 >> 4));
            if (c2 !== -1) bytes.push(((c1 & 0xf) << 4) | (c2 >> 2));
            if (c3 !== -1) bytes.push(((c2 & 3) << 6) | c3);
        }
        return bytes;
    }

    // ---- 主加密函数 ----
    function encrypt(obj, key) {
        key = key || DEFAULT_KEY;
        var json = JSON.stringify(obj);
        var bytes = strToBytes(json);
        var kb = strToBytes(key), kl = kb.length;
        // 异或 + 位置混淆
        for (var i = 0; i < bytes.length; i++) {
            bytes[i] = ((bytes[i] ^ kb[i % kl]) + (i % 256)) % 256;
        }
        // Base64 + 字符置换
        var b64 = b64Encode(bytes), out = "";
        for (var j = 0; j < b64.length; j++) out += charFwd(b64[j]);
        return PREFIX + out;
    }

    // ---- 主解密函数 ----
    function decrypt(text, key) {
        key = key || DEFAULT_KEY;
        if (text.indexOf(PREFIX) !== 0) throw new Error("无效代码：缺少 JZR1 前缀");
        var shuffled = text.substring(PREFIX.length);
        // 反向字符置换
        var b64 = "";
        for (var i = 0; i < shuffled.length; i++) b64 += charRev(shuffled[i]);
        // Base64 解码
        var bytes = b64Decode(b64);
        // 反向位置混淆 + 异或
        var kb = strToBytes(key), kl = kb.length;
        for (var j = 0; j < bytes.length; j++) {
            bytes[j] = ((bytes[j] - (j % 256) + 256) % 256) ^ kb[j % kl];
        }
        var json = bytesToStr(bytes);
        return JSON.parse(json);
    }

    return { encrypt: encrypt, decrypt: decrypt, DEFAULT_KEY: DEFAULT_KEY };
})();

// Node.js CommonJS 导出（后端使用）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = JZR;
}
