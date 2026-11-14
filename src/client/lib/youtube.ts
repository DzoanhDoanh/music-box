export function playbackError(code: number, title: string) {
  const reason =
    code === 101 || code === 150
      ? 'YouTube không cho phép phát video này trong ROOMTUNE. Bạn có thể thử nghe trực tiếp trên YouTube.'
      : code === 100
        ? 'Video đã bị gỡ hoặc chuyển sang riêng tư. Mở YouTube để kiểm tra hoặc tìm bản khác của bài hát.'
        : code === 5
          ? 'Trình phát gặp lỗi. Hãy thử lại trong phòng hoặc mở bài trên YouTube.'
          : code === 153
            ? 'YouTube không xác minh được trang phát. Hãy thử lại hoặc mở bài trực tiếp trên YouTube.'
            : code === 2
              ? 'YouTube không nhận được thông tin video hợp lệ. Hãy mở YouTube để kiểm tra hoặc tìm bản khác.'
              : 'YouTube chưa phát được video. Hãy thử lại hoặc mở bài trực tiếp trên YouTube.';
  return `“${title}”: ${reason} (Mã ${code})`;
}
export function youtubeWatchUrl(videoId: string, position: number) {
  const seconds = Number.isFinite(position) ? Math.max(0, Math.floor(position)) : 0;
  return `https://www.youtube.com/watch?${new URLSearchParams({ v: videoId, t: `${seconds}s` })}`;
}
let youtubeReady: Promise<void> | undefined;
export function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubeReady)
    youtubeReady = new Promise<void>((resolve, reject) => {
      let settled = false;
      const script = document.createElement('script');
      const cleanup = () => {
        clearTimeout(timer);
        script.onerror = null;
        if (window.onYouTubeIframeAPIReady === onReady) window.onYouTubeIframeAPIReady = () => {};
      };
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        script.remove();
        youtubeReady = undefined;
        reject(new Error(message));
      };
      const timer = setTimeout(
        () => fail('Không tải được YouTube Player. Hãy thử lại hoặc mở bài trên YouTube.'),
        15000,
      );
      const onReady = () => {
        if (settled || !window.YT?.Player) return;
        settled = true;
        cleanup();
        resolve();
      };
      window.onYouTubeIframeAPIReady = onReady;
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => fail('Không kết nối được YouTube. Hãy kiểm tra mạng rồi thử lại.');
      document.head.appendChild(script);
    });
  return youtubeReady;
}
