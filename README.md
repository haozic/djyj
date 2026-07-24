# 《党建研究》全文检索系统

覆盖 2020-2026 年全期共 1627 篇文章的全文检索网站，支持搜索、板块分类、目录浏览和文章收藏。

## 项目结构

```
├── index.html              # 主页面
├── _headers                # Cloudflare Pages 缓存规则
├── _redirects              # Cloudflare Pages 重定向规则
├── .nojekyll               # 禁用 GitHub Pages Jekyll 处理
├── .gitignore
├── assets/
│   ├── css/
│   │   └── style.css       # 移动优先响应式样式
│   └── js/
│       └── app.js          # 核心逻辑（搜索、收藏、懒加载）
├── data/
│   ├── meta.json           # 全部文章元数据（约336KB）
│   └── years/
│       ├── 2020.json       # 按年份拆分的正文数据
│       ├── 2021.json
│       ├── 2022.json
│       ├── 2023.json
│       ├── 2024.json
│       ├── 2025.json
│       └── 2026.json
└── articles/               # 原始 Markdown 文件（可选，不影响网站运行）
```

## 功能特性

- **全文搜索**：支持标题、作者、正文搜索，关键词高亮
- **懒加载**：先加载元数据（336KB），年份数据按需后台加载
- **板块分类**：40 个板块统计，点击查看板块全部文章
- **目录浏览**：按年份 → 期数 → 板块层级展开
- **文章收藏**：基于 localStorage，支持导出/清空
- **移动适配**：移动端底部导航栏，桌面端顶部标签栏
- **Markdown 渲染**：保留加粗、小标题等格式

## 部署到 GitHub + Cloudflare Pages

### 第一步：上传到 GitHub

```bash
# 初始化 Git 仓库
cd e:\cursor\xgkt\djyj
git init
git add .
git commit -m "党建研究全文检索系统"

# 关联 GitHub 远程仓库（先在 GitHub 上创建空仓库）
git remote add origin https://github.com/你的用户名/djyj.git
git branch -M main
git push -u origin main
```

> 注意：`articles/` 文件夹有 1400+ 个 Markdown 文件，如果推送过慢，可以在 `.gitignore` 中添加 `articles/` 排除（网站运行不依赖该文件夹）。

### 第二步：Cloudflare Pages 部署

#### 方式一：连接 GitHub（推荐，自动部署）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **创建应用程序** → **Pages**
3. 选择 **连接到 Git**
4. 授权并选择你的 GitHub 仓库 `djyj`
5. 构建配置：
   - **框架预设**：无
   - **构建命令**：留空（纯静态站点，无需构建）
   - **构建输出目录**：`/`（根目录）
6. 点击 **保存并部署**
7. 等待部署完成，获得 `xxx.pages.dev` 域名

#### 方式二：Wrangler CLI 手动部署

```bash
# 安装 Wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 部署（在项目根目录执行）
wrangler pages deploy . --project-name=djyj
```

### 第三步：绑定自定义域名（可选）

1. 在 Cloudflare Pages 项目设置中 → **自定义域**
2. 添加你的域名，按提示配置 DNS 记录
3. Cloudflare 会自动签发 SSL 证书

## 本地开发

```bash
# 启动本地服务器
cd e:\cursor\xgkt\djyj
python -m http.server 8765

# 浏览器访问
# http://localhost:8765/
```

## 技术说明

- **数据拆分**：总数据约 25MB，拆分为 1 个元数据文件 + 7 个年份数据文件，实现懒加载
- **搜索性能**：前端全量搜索，防抖 250ms，结果上限 200 条
- **收藏持久化**：使用 `localStorage`（键名 `djyj_favorites`），支持 JSON 导出
- **缓存策略**：静态资源（CSS/JS/JSON）长期缓存，HTML 不缓存确保更新及时
