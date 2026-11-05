import { useEffect, useState } from 'react';

/** Blob이면 object URL을 만들어 주고, 언마운트/변경 시 자동으로 해제한다. 문자열은 그대로 사용. */
export function useObjectUrl(source: Blob | string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (typeof source === 'string' ? source : null));

  useEffect(() => {
    if (!source) {
      setUrl(null);
      return;
    }
    if (typeof source === 'string') {
      setUrl(source);
      return;
    }
    const objectUrl = URL.createObjectURL(source);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [source]);

  return url;
}
