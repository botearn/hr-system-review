import type { AxiosResponse } from "axios";

export function saveBlobResponse(res: AxiosResponse<Blob>, fallbackName: string): void {
  const disposition = res.headers["content-disposition"] as string | undefined;
  let filename = fallbackName;
  if (disposition) {
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (utf8) {
      filename = decodeURIComponent(utf8[1]);
    } else {
      const plain = /filename="?([^";]+)"?/i.exec(disposition);
      if (plain) filename = plain[1];
    }
  }

  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
