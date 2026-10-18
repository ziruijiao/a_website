# Cloudflare Workers 部署指南

本网站后端已适配 Cloudflare Workers，使用 **KV 存储**保存文章数据，**Worker Assets**托管静态文件。

## 前置准备

1. 注册 [Cloudflare](https://dash.cloudflare.com/) 账号
2. 安装 Node.js（用于运行 wrangler CLI）
3. 安装 wrangler：
   ```bash
   npm install -g wrangler
   ```

## 部署步骤

### 1. 登录 Cloudflare

```bash
wrangler login
```

### 2. 创建 KV 命名空间

```bash
wrangler kv namespace create ARTICLES_KV
```

执行后会输出一个 `id`，复制下来。

### 3. 配置 wrangler.toml

编辑 `wrangler.toml`，把 `你的KV_NAMESPACE_ID` 换成上一步得到的 id：

```toml
[[kv_namespaces]]
binding = "ARTICLES_KV"
id = "你复制的id"
```

### 4. 设置密钥配置（KV 存储，推荐）

CF Workers 无文件系统，密钥存在 KV 里（key 为 `config`，值为 JSON）：

```bash
# 写入密钥配置到 KV
wrangler kv key put config --namespace-id=你的KV_NAMESPACE_ID '{"ADMIN_PWD":"你的密码","JZR_KEY":"你的密钥"}'
```

> 也可以用环境变量/secret 作为备选：`wrangler secret put ADMIN_PWD`。KV 里的 `config` 优先级高于环境变量。

### 5. 部署

```bash
wrangler deploy
```

部署成功后会输出一个 `*.workers.dev` 域名，访问即可。

### 6. 绑定自定义域名（可选）

在 Cloudflare Dashboard → Workers & Pages → 你的 Worker → Settings → Domains & Routes → Add，绑定 `zirui.riliwuhou.de5.net`。

## 验证部署

部署完成后，在浏览器访问：

| 页面 | 地址 |
|------|------|
| 网站首页 | `https://你的域名/` |
| 管理后台 | `https://你的域名/admin.html` |
| 文章 API | `https://你的域名/api/articles` |

测试投稿功能：
1. 打开网站 → 校园动态 → 我要投稿
2. 填写内容，勾选「我同意用户协议和隐私政策」
3. 点「生成加密投稿代码」，应该返回 `JZR1:` 开头的代码

## 注意事项

- **文章数据存在 KV 里**，不再读写 `articles.js` 文件。`articles.js` 仅作为本地开发时的初始数据参考。
- **token 存在 Worker 内存中**，Worker 冷启动或多实例时可能失效，需要重新登录。生产环境建议把 token 也存在 KV 里。
- **静态文件**通过 Worker Assets 托管，`wrangler deploy` 时会自动上传当前目录的文件。
- 如果图片较多，建议把图片放到 CF R2 或 CDN，不要全放 Worker Assets 里。

## 常用命令

```bash
# 本地开发预览
wrangler dev

# 部署
wrangler deploy

# 查看日志
wrangler tail

# 创建 KV
wrangler kv namespace create NAME

# 列出 KV
wrangler kv namespace list

# 设置密钥
wrangler secret put VAR_NAME
```
