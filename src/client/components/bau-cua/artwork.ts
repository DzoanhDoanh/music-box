/** Original vector illustrations shared by the board and the six 3D die faces. */
const drawings = {
  BAU: '<path d="M47 28q-7-15 6-21" fill="none" stroke="#466a30" stroke-width="7"/><path d="M50 17q22-15 29 2-19 7-29-2" fill="#80ad45"/><path d="M50 27c-22 0-23 21-13 32-29 8-27 41 13 41s42-33 13-41c10-11 9-32-13-32" fill="#8cba4b"/><path d="M42 35c-9 4-8 13-4 16M34 70q-13 13 0 20" fill="none" stroke="#c4db8b" stroke-width="6" stroke-linecap="round"/>',
  CUA: '<g fill="none" stroke="#bf4146" stroke-width="6" stroke-linecap="round"><path d="m30 65-19-12m20 21L9 73m24 9L17 94M70 65l19-12M69 74l22-1M67 82l16 12M27 54 17 31m56 23 10-23"/></g><g fill="#ed665b"><path d="M15 12 7 27q-1 19 17 12l7-19-12 5zM85 12l8 15q1 19-17 12l-7-19 12 5z"/><ellipse cx="50" cy="67" rx="32" ry="23"/></g><g stroke="#bf4146" stroke-width="6"><path d="m38 49-3-13m27 13 3-13"/></g><g fill="#fff5dc"><circle cx="35" cy="35" r="7"/><circle cx="65" cy="35" r="7"/></g><g fill="#352c31"><circle cx="36" cy="35" r="3"/><circle cx="64" cy="35" r="3"/></g><path d="M41 74q9 8 18 0" fill="none" stroke="#9a303c" stroke-width="3"/>',
  TOM: '<path d="M68 30Q25 8 21 51t34 43q34-6 24-33-5-14-23-5 17 3 10 16-17 13-22-10-3-20 24-32" fill="#ed9653"/><path d="m67 30 18-16-4 28M55 92l30 3-13-17" fill="#d75b46"/><path d="M30 43 48 49M25 58l19 6M30 77l19-3M43 89l11-12" stroke="#b45135" stroke-width="4"/><path d="M65 28Q61 3 94 7M68 32q22-10 27 5" fill="none" stroke="#b45135" stroke-width="3"/><circle cx="58" cy="34" r="4" fill="#302c33"/>',
  CA: '<path d="m30 53-24-22v47z" fill="#3c8298"/><path d="M43 38 56 17l18 25M45 73l18 21 9-22" fill="#72b7c3"/><path d="M24 55q38-47 72 0-34 47-72 0" fill="#50a5bb"/><path d="M66 36q-13 19 0 38M40 49l13 7-13 8" fill="none" stroke="#b3e0db" stroke-width="4"/><circle cx="79" cy="51" r="7" fill="#fff5dc"/><circle cx="80" cy="51" r="3" fill="#302c33"/>',
  GA: '<path d="M40 74Q2 68 15 26q25-4 28 48" fill="#397a67"/><path d="M32 64Q4 48 29 13q22 14 15 51" fill="#59a383"/><path d="M43 57c-6-35 36-40 35-9l-8 28q-5 25-30 10-21-12-7-29" fill="#e7b866"/><path d="M60 29q-18-19-5-21l9 9Q75-5 80 12l-2 18M76 49q14 23-5 18" fill="#d45249"/><path d="m78 35 17 9-17 7" fill="#d68a36"/><circle cx="72" cy="36" r="4" fill="#302c33"/><path d="m45 89-2 12m18-14 2 14M34 102h20m0 0h20" stroke="#b87832" stroke-width="4"/><path d="M35 62q10 25 24 0" fill="#ca8b43"/>',
  NAI: '<g fill="none" stroke="#805337" stroke-width="6" stroke-linecap="round"><path d="M36 39 26 8m7 22L10 19M27 13 13 4M64 39 74 8m-7 22 23-11M73 13l14-9"/></g><path d="M33 46Q3 23 9 53l24 8M67 46q30-23 24 7l-24 8" fill="#a7734a"/><path d="M50 34q-35 0-26 38l26 31 26-31q9-38-26-38" fill="#bf8c58"/><path d="m50 57-17 25 17 21 17-21" fill="#e8c99c"/><g fill="#302c33"><circle cx="36" cy="60" r="4"/><circle cx="64" cy="60" r="4"/><path d="M42 80q8-7 16 0l-8 9z"/></g><path d="M34 44h3m26 0h3" stroke="#f8ddb0" stroke-width="4" stroke-linecap="round"/>',
};
export const symbolArtwork = Object.fromEntries(
  Object.entries(drawings).map(([key, drawing]) => [
    key,
    'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 110">${drawing}</svg>`,
      ),
  ]),
) as Record<keyof typeof drawings, string>;
