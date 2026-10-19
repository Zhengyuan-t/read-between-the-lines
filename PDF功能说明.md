# PDF 原版阅读模式（方案 A）

## 使用
1. 把 PDF 上传 ChatGPT，使用 `PDF解析提示词.md` 生成 `.json` 文件。
2. 打开 `pdf-reader.html`，选择原始 PDF 和 JSON，点击“打开 PDF 阅读”。
3. 通过上一页、下一页、缩放阅读，点击蓝色轻提示的句子区域查看解析。

## 部署
将此发布包**全部内容**上传到 GitHub Pages 仓库根目录。保留 `assets/`、`vendor/` 目录。现有 Excel、CSV、JSON 粘贴导入、复习、词汇和外观功能保持原样。

**注意**：当前 PDF.js 使用 cdnjs.cloudflare.com 的脚本与 Worker，因此 PDF 阅读模式**首次加载依赖该 CDN 可访问**。在中国大陆可能不稳定。为完全离线/不依赖 CDN 的部署，应下载 PDF.js 3.11.174 的 `pdf.min.js` 和 `pdf.worker.min.js` 放到 `vendor/`，并将 `pdf-reader.html` 和 `pdf-reader.js` 中的两个 CDN 地址分别改为 `vendor/pdf.min.js`、`vendor/pdf.worker.min.js`。本发布包未附带这两个 PDF.js 文件。

## 当前边界
- 适用于可提取文本的 PDF；不包含 OCR。
- 不重新排版 PDF，而是 PDF.js 原样渲染，句子点击层覆盖文字坐标。
- PDF.js 提取文本时可能拆分连字、插入换行或以非阅读顺序返回双栏文本，部分句子可能无法匹配。
- 一次一篇 PDF，文件在浏览器内处理，当前 PDF 阅读会话不保存文件；刷新后需重新导入。
- PDF 句子点击区域为普通点击；原有 HTML 文章阅读的快捷键不受影响。
- 未进行跨浏览器自动化测试，建议上线前用单栏、多栏、重复句、跨行及手机 PDF 分别测试。
