/* Dependencies are copied into dist/vendor by npm run build. Files never leave the device. */
(function () {
  let tesseract, pdfLibrary;
  function loadTesseract() {
    if (!tesseract) {
      tesseract = new Promise((resolve, reject) => {
        if (window.Tesseract) return resolve(window.Tesseract);
        const script = document.createElement('script');
        script.src = 'vendor/tesseract/tesseract.min.js';
        function finish(error) {
          clearTimeout(timeout);
          script.remove();
          if (error) reject(error);
          else resolve(window.Tesseract);
        }
        const fail = () => finish(new Error('Não foi possível iniciar a leitura de texto no aparelho.'));
        const timeout = setTimeout(fail, 15000);
        script.onload = () => (typeof window.Tesseract?.createWorker === 'function' ? finish() : fail());
        script.onerror = fail;
        document.head.appendChild(script);
      }).catch((error) => {
        tesseract = null;
        throw error;
      });
    }
    return tesseract;
  }
  function loadPdf() {
    if (!pdfLibrary) {
      pdfLibrary = import('../vendor/pdf/pdf.mjs')
        .then((pdf) => {
          pdf.GlobalWorkerOptions.workerSrc = 'vendor/pdf/pdf.worker.mjs';
          return pdf;
        })
        .catch((error) => {
          pdfLibrary = null;
          throw error;
        });
    }
    return pdfLibrary;
  }
  async function withDeadline(promise, ms) {
    let timeout;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('A leitura de texto demorou demais.')), ms);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
  function textPosition(item) {
    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    const bbox = item?.bbox;
    if (!text || !bbox || ![bbox.x0, bbox.y0, bbox.x1, bbox.y1].every(Number.isFinite)
      || bbox.x1 <= bbox.x0 || bbox.y1 <= bbox.y0) return null;
    return { text, bbox, confidence: item.confidence };
  }
  function positionedLines(blocks) {
    const lines = (blocks || []).flatMap((block) =>
      (block.paragraphs || []).flatMap((paragraph) => paragraph.lines || []),
    );
    return lines.flatMap((line) => {
      const position = textPosition(line);
      return position ? [{ ...position, words: (line.words || []).map(textPosition).filter(Boolean) }] : [];
    });
  }
  window.withReceiptReader = async function (read) {
    let worker,
      startup,
      startupError,
      progress = () => {};
    const ocr = async (source, options, layout = false) => {
      if (startupError) throw startupError;
      if (!startup)
        startup = loadTesseract().then((Tesseract) =>
          Tesseract.createWorker('por+eng', 1, {
            workerPath: 'vendor/tesseract/worker.min.js',
            corePath: 'vendor/core',
            langPath: 'vendor/lang',
            gzip: true,
            workerBlobURL: false,
            cacheMethod: 'none',
            errorHandler: () => {},
            logger: (m) => progress(m.status + ' ' + Math.round((m.progress || 0) * 100) + '%'),
          }),
        );
      if (!worker) {
        try {
          worker = await withDeadline(startup, 20000);
        } catch (error) {
          // A worker that finishes starting after the deadline has no caller.
          void startup.then((late) => late.terminate()).catch(() => {});
          startupError = error;
          throw error;
        }
      }
      try {
        const output = layout ? { blocks: true } : undefined;
        const { data } = await withDeadline(worker.recognize(source, options, output), 20000);
        const result = { text: data.text, confidence: data.confidence };
        return layout ? { ...result, lines: positionedLines(data.blocks) } : result;
      } catch (error) {
        await worker.terminate().catch(() => {});
        worker = startup = null;
        throw error;
      }
    };
    async function recognize(file, report = () => {}, options, { layout = false } = {}) {
      if (!file || file.size > 12 * 1024 * 1024) throw new Error('Selecione imagem/PDF com até 12 MB.');
      const pdfFile = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!pdfFile && !/^image\/(png|jpeg|webp|bmp)$/.test(file.type)) throw new Error('Use PNG, JPEG, WebP, BMP ou PDF.');
      progress = report;
      if (!pdfFile) return ocr(file, options, layout);
      const pdf = await loadPdf();
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
            const result = await ocr(canvas);
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
      if (worker) await worker.terminate().catch(() => {});
    }
  };
  window.recognizeReceipt = (file, progress) => window.withReceiptReader((recognize) => recognize(file, progress));
})();
