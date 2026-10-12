# 句读：GitHub Pages 发布版

这是纯浏览器网站，可直接发布到 GitHub Pages。访问者不需要 Python、终端或 API 密钥。Excel 在访问者的浏览器中读取，文章和解析不上传服务器；阅读数据保存在该浏览器中。

## 上传和开启 GitHub Pages

1. 在 GitHub 创建一个仓库，例如 `sentence-reader`。使用免费个人账户时，选择 Public。
2. 解压发布包，上传里面的文件和文件夹到仓库根目录。不要只上传 ZIP，也不要多套一层文件夹。
3. 根目录应该直接看到 `index.html`、`app.js`、`import-browser.js`、`styles.css`、`assets/` 和 `vendor/`。同时保留 `.nojekyll`；如果 Finder 隐藏它，可用 Command+Shift+. 显示隐藏文件，或在 GitHub 创建一个名为 `.nojekyll` 的空文件。
4. 打开仓库 **Settings → Pages**，选择 **Deploy from a branch**，分支为 **main**，文件夹为 **/(root)**，点击 **Save**。
5. 等待部署成功后，Pages 会显示网站地址，通常是 `https://你的用户名.github.io/sentence-reader/`。
6. 打开网站，先点击“体验示例文章”，或导入 `assets/示例文章.xlsx` 验证。

无需构建命令、Python 服务或环境变量。不要把旧版的 server.py 或启动文件上传到此发布目录。这里提供的是发布文件，尚未替你创建仓库或发布网站。

官方说明：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 使用

- Excel：第一列是句子，第二列是完整翻译与语法解析；建议表头为“句子”“解析”。一句一行，空行分段，一张工作表一篇文章。
- 默认按住空格并左键点击句子。设置中可自定义键盘组合，左键固定。Esc 用于关闭弹窗；也可以 Tab 聚焦句子后按 Enter。
- 点击范围依据句子实际换行后的文字区域计算；普通点击或拖动仍可选择文字。
- 网站内提供可复制、下载的 AI 提示词和完整的示例 Excel。它显示已导入的翻译和解析，不自动调用 AI 生成解析。
- 支持未加密的 `.xlsx` 和 `.csv`，包括 Numbers 导出的 `.xlsx`；旧 `.xls` 需先另存为 `.xlsx`。不接受合并单元格或公式，请先转为普通单元格和文本值。
- 一次导入一个文件，文件上限 10 MB，解压后上限 40 MB；每张表最多 5,000 句，每次最多 50 张非空工作表。
- 缺少解析的句子会保留并提示。重复句子逐行关联，不去重。
- 可在导入 Excel 后选择“匹配原文 TXT”，加载 UTF-8 原文并匹配对应句子；未匹配内容会标示，不会借用其他句子的解析。
- 文章与设置保存在当前浏览器、当前网站路径下。清理网站数据可能丢失记录；更换设备、浏览器、域名或仓库路径后需要重新导入，请保留原始 Excel。
- 不要将你自己的学习文章放进公开仓库，除非你希望它成为公开文件。用户在网页中导入的文件不会自动进入仓库。

## 更新网站

将修改后的对应网站文件上传到同一仓库并提交即可，GitHub Pages 会重新发布。不要删除需要保留的 assets 或 vendor 文件夹。更新后如果看到旧页面，可刷新浏览器。

## 文件说明

- `index.html`、`styles.css`、`app.js`：页面、样式和阅读交互。
- `import-browser.js`：浏览器端 Excel、CSV 解析。
- `vendor/jszip.min.js`：随网站一起提供的 ZIP 解压库，不依赖外部 CDN。
- `vendor/JSZip-LICENSE.md`：第三方许可，本项目按 MIT 许可使用 JSZip。
- `assets/示例文章.xlsx`：博物馆故事的 15 句完整翻译与解析。
- `assets/AI提示词.md`：让 AI 生成两列解析 Excel 的完整提示词。
- `assets/sample.json`：内置示例。
- `.nojekyll`：让 GitHub Pages 直接提供静态文件。

建议使用近期版本的 Chrome、Edge、Safari 或 Firefox。直接双击本地 index.html 不是本包的部署方式，请通过 GitHub Pages 网址访问。
