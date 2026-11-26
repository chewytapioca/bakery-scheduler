import { useEffect, useRef, useState } from "react";

const MOVES = ["hop", "wiggle", "squish"] as const;

/**
 * A character you can tap. Each tap plays a little animation and shows a speech bubble.
 * Three quick taps in a row make it do a flip.
 */
export function Tappable({ src, name, lines, imgClass = "", className = "" }: {
  src: string;
  name: string;
  lines: () => string[];      // called on tap, so the lines can depend on what the character is doing right now
  imgClass?: string;          // classes for the image itself (e.g. an idle animation, or a mirror flip)
  className?: string;
}) {
  const [tap, setTap] = useState(0);
  const [move, setMove] = useState<string>("");
  const [line, setLine] = useState<string | null>(null);
  const recent = useRef<number[]>([]);
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(hide.current), []);

  const onTap = () => {
    const now = performance.now();
    recent.current = [...recent.current.filter((t) => now - t < 900), now];
    const combo = recent.current.length >= 3;
    if (combo) recent.current = [];
    setMove(combo ? "flip" : MOVES[Math.floor(Math.random() * MOVES.length)]);
    const options = combo ? ["Wheee!", "Ta-da!", "Did you see that?"] : lines();
    setLine(options[Math.floor(Math.random() * options.length)]);
    setTap((n) => n + 1); // new key restarts the animation even if the same move repeats
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setLine(null), 1800);
  };

  return (
    <button type="button" className={`tap ${className}`} onClick={onTap} aria-label={`Tap ${name}`}>
      <span key={tap} className={`tap-move ${tap ? move : ""}`}>
        <img src={src} alt="" className={imgClass} draggable={false} />
      </span>
      {line && <span key={`b${tap}`} className="bubble" role="status">{line}</span>}
    </button>
  );
}