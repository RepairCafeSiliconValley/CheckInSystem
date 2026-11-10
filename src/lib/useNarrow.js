import { useState, useEffect } from "react";

// True while the viewport is at most `maxWidth` px wide; follows resizes and
// rotation. For layouts that inline styles alone can't adapt.
export function useNarrow(maxWidth) {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
}
