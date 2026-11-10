/* Dependencies are copied into dist/vendor by npm run build. Files never leave the device. */
(function () {
  let libraries;
  async function load() {
    if (!libraries)
      libraries = Promise.all([
        new Promise((resolve, reject) => {
          if (window.Tesseract) return resolve(window.Tesseract);
          const script = document.createElement('script');
          script.src = 'vendor/tesseract/tesseract.min.js';
          script.onload = () => resolve(window.Tesseract);
          script.onerror = () => reject(new Error('OCR indisponível. Execute npm run build e sirva dist/.'));
          document.head.appendChild(script);
        }),
        import('../vendor/pdf/pdf.mjs').then((pdf) => {
          pdf.GlobalWorkerOptions.workerSrc = 'vendor/pdf/pdf.worker.mjs';
          return pdf;
        }),
      ]).catch((error) => {
        libraries = null;
        throw error;
      });
    return libraries;
  }
  window.withReceiptReader = async function (read) {
    let worker, progress;
    const ocr = async (Tesseract, source, options) => {
      if (!worker)
        worker = await Tesseract.createWorker('por+eng', 1, {
          workerPath: 'vendor/tesseract/worker.min.js',
          corePath: 'vendor/core',
          langPath: 'vendor/lang',
          gzip: true,
          workerBlobURL: false,
          cacheMethod: 'none',
          logger: (m) => progress(m.status + ' ' + Math.round((m.progress || 0) * 100) + '%'),
        });
      try {
        const { data } = await worker.recognize(source, options);
        return { text: data.text, confidence: data.confidence };
      } catch (error) {
        await worker.terminate().catch(() => {});
        worker = null;
        throw error;
      }
    };
    async function recognize(file, report, options) {
      if (!file || file.size > 12 * 1024 * 1024) throw new Error('Selecione imagem/PDF com até 12 MB.');
      const pdfFile = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!pdfFile && !/^image\/(png|jpeg|webp|bmp)$/.test(file.type)) throw new Error('Use PNG, JPEG, WebP, BMP ou PDF.');
      const [Tesseract, pdf] = await load();
      progress = report;
      if (!pdfFile) return ocr(Tesseract, file, options);
      progress('Lendo PDF localmente…');
      const loadingTask = pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
      try {
        const documentPdf = await loadingTask.promise;
        if (documentPdf.numPages > 10) throw new Error('PDF com mais de 10 páginas. Separe o comprovante desejado.');
        const texts = [],
          confidences = [];
        for (let n = 1; n <= documentPdf.numPages; n++) {
          progress('Página ' + n + ' de ' + documentPdf.numPages);
          const page = await documentPdf.getPage(n);
          const content = await page.getTextContent();
          let text = '',
            lastY = null;
          for (const item of content.items) {
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 3) text += '\n';
            text += item.str + ' ';
            lastY = item.transform[5];
            if (item.hasEOL) text += '\n';
          }
          if (text.trim().length < 25) {
            const initial = page.getViewport({ scale: 2 });
            const scale = Math.min(2, 3000 / Math.max(initial.width / 2, initial.height / 2));
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            const result = await ocr(Tesseract, canvas);
            text = result.text;
            confidences.push(result.confidence);
            canvas.width = canvas.height = 0;
          }
          texts.push(text);
          page.cleanup();
        }
        return { text: texts.join('\n'), confidence: confidences.length ? Math.min(...confidences) : null };
      } finally {
        await loadingTask.destroy();
      }
    }
    try {
      return await read(recognize);
    } finally {
      if (worker) await worker.terminate();
    }
  };
  window.recognizeReceipt = (file, progress) => window.withReceiptReader((recognize) => recognize(file, progress));
})();
