/**
 * DESIGN PHILOSOPHY: Soft Storybook Illustrated — Mobile-First
 * Layout: scene fills all remaining viewport height; stats + buttons locked to bottom.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const DEFAULT_SPRITES = {
  idle: "https://d2xsxph8kpxj0f.cloudfront.net/310519663319804960/ZZbcc4hqPwZ5dXpq3tuwcG/cat_sprite_idle_1af3e57d.png",
  happy: "https://d2xsxph8kpxj0f.cloudfront.net/310519663319804960/ZZbcc4hqPwZ5dXpq3tuwcG/cat_sprite_happy_0b3cf1ee.png",
  sleeping: "https://d2xsxph8kpxj0f.cloudfront.net/310519663319804960/ZZbcc4hqPwZ5dXpq3tuwcG/cat_sprite_sleeping_4bb7399d.png",
  eating: "https://d2xsxph8kpxj0f.cloudfront.net/310519663319804960/ZZbcc4hqPwZ5dXpq3tuwcG/cat_sprite_eating_2a0a6178.png",
};
const BG_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663319804960/ZZbcc4hqPwZ5dXpq3tuwcG/game_background_portrait-B69PtU8ikBv8BEA3F6aqCM.webp";

type CatMood = "idle" | "happy" | "sleeping" | "eating";

interface Particle {
  id: number;
  x: number;
  y: number;
  emoji: string;
  vx: number;
  vy: number;
}

interface Stats {
  hunger: number;
  happiness: number;
  energy: number;
  cleanliness: number;
}

interface SpriteSet {
  idle: string;
  happy: string;
  sleeping: string;
  eating: string;
}

const STAT_DECAY_RATE = 0.5;
const STAT_DECAY_INTERVAL = 3000;

function StatBar({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const isLow = pct < 25;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span
          className="flex items-center gap-1 font-medium"
          style={{
            fontFamily: "'Quicksand', sans-serif",
            color: "#5c4a32",
            fontSize: "clamp(0.68rem, 2.8vw, 0.82rem)",
          }}
        >
          <span>{icon}</span> {label}
        </span>
        <span
          className="font-bold"
          style={{
            fontFamily: "'Quicksand', sans-serif",
            color: isLow ? "#c0392b" : "#7a6045",
            fontSize: "clamp(0.62rem, 2.4vw, 0.75rem)",
          }}
        >
          {Math.round(pct)}%
        </span>
      </div>
      <div
        className="relative rounded-full overflow-hidden"
        style={{
          height: "clamp(8px, 2vw, 14px)",
          background: "rgba(180,150,100,0.2)",
          border: "2px solid rgba(180,150,100,0.4)",
        }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        {isLow && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: "rgba(255,80,80,0.3)" }}
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </div>
    </div>
  );
}

function ActionButton({
  emoji,
  label,
  onClick,
  color,
  disabled,
}: {
  emoji: string;
  label: string;
  onClick: () => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.08, y: disabled ? 0 : -3 }}
      whileTap={{ scale: disabled ? 1 : 0.93 }}
      className="flex flex-col items-center justify-center rounded-2xl font-bold text-white flex-1"
      style={{
        background: disabled ? "#c8b89a" : color,
        fontFamily: "'Fredoka One', cursive",
        fontSize: "clamp(0.6rem, 2.4vw, 0.82rem)",
        border: "3px solid rgba(255,255,255,0.4)",
        cursor: disabled ? "not-allowed" : "pointer",
        minWidth: 0,
        padding: "clamp(6px, 1.8vw, 11px) clamp(2px, 1vw, 6px)",
        boxShadow: disabled ? "none" : `0 4px 12px ${color}66`,
      }}
    >
      <span style={{ fontSize: "clamp(1.1rem, 4.5vw, 1.5rem)", lineHeight: 1.2 }}>
        {emoji}
      </span>
      {label}
    </motion.button>
  );
}

let particleCounter = 0;

function UploadModal({
  onClose,
  onSpritesGenerated,
}: {
  onClose: () => void;
  onSpritesGenerated: (sprites: SpriteSet, name: string) => void;
}) {
  // step 1 = photo upload, step 2 = name input (while sprites generate in background)
  const [step, setStep] = useState<1 | 2>(1);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [petName, setPetName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // hold generated sprites until user confirms name
  const pendingSpritesRef = useRef<SpriteSet | null>(null);

  const generateMutation = trpc.pet.generateSprites.useMutation({
    onSuccess: (data) => {
      pendingSpritesRef.current = data.sprites;
      // If user already submitted the name, finish immediately
      if (pendingSpritesRef.current && petName.trim()) {
        finishAdoption(data.sprites, petName.trim());
      }
      // Otherwise we wait — the name step's confirm button will call finishAdoption
    },
    onError: () => {
      toast.error("Oh no! Something went wrong bringing your pet home. Give it another try! 🐾");
      setStep(1);
    },
  });

  const finishAdoption = (sprites: SpriteSet, name: string) => {
    onSpritesGenerated(sprites, name);
    toast.success(`Welcome home, ${name}! 🏠🐾`);
    onClose();
  };

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) { toast.error("Hmm, that doesn't look like a photo! Try a JPG or PNG. 🐾"); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("That photo is a bit too big! Try one under 10MB. 📸"); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // Step 1 → Step 2: kick off generation AND advance the modal
  const handleMoveIn = () => {
    if (!file || !preview) return;
    generateMutation.mutate({ imageBase64: preview.split(",")[1], mimeType: file.type });
    setStep(2);
    // auto-focus name input after transition
    setTimeout(() => nameInputRef.current?.focus(), 350);
  };

  // Step 2 confirm: either sprites are ready or we wait for them
  const handleConfirmName = () => {
    const name = petName.trim() || "Fluffy";
    if (pendingSpritesRef.current) {
      finishAdoption(pendingSpritesRef.current, name);
    }
    // else: onSuccess will call finishAdoption once sprites arrive
  };

  const trimmedName = petName.trim();
  const isGenerating = generateMutation.isPending;
  const spritesReady = !!pendingSpritesRef.current;

  // Loading dot animation messages
  const loadingMessages = [
    "Fluffing up the cat bed...",
    "Stocking the food bowl...",
    "Hanging up welcome bunting...",
    "Ironing the welcome mat...",
    "Teaching the neighbours to wave...",
  ];
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  useEffect(() => {
    if (step !== 2 || spritesReady) return;
    const t = setInterval(() => setLoadingMsgIdx((i) => (i + 1) % loadingMessages.length), 3000);
    return () => clearInterval(t);
  }, [step, spritesReady]);

  const sharedCardStyle = {
    background: "linear-gradient(135deg, #fdf6e3, #faebd7)",
    border: "4px solid rgba(180,140,90,0.5)",
    padding: "clamp(1rem, 5vw, 1.5rem)",
    maxHeight: "90vh",
    overflowY: "auto" as const,
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(60,40,20,0.6)", backdropFilter: "blur(4px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={step === 1 ? onClose : undefined}
    >
      <motion.div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl"
        style={sharedCardStyle}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center mb-3 sm:hidden">
          <div className="rounded-full" style={{ width: "40px", height: "4px", background: "rgba(180,140,90,0.4)" }} />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            /* ── STEP 1: Photo upload ── */
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.22 }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: "clamp(1.2rem, 5vw, 1.5rem)", color: "#7a4f2a" }}>
                  🏠 Adopt a New Friend!
                </h2>
                <button
                  onClick={onClose}
                  className="rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold"
                  style={{ background: "rgba(180,140,90,0.2)", color: "#7a4f2a" }}
                >×</button>
              </div>
              <p style={{ fontFamily: "'Quicksand', sans-serif", color: "#9a7a55", fontSize: "clamp(0.78rem, 3vw, 0.85rem)", marginBottom: "1rem" }}>
                Got a furry (or scaly, or feathery!) friend waiting for a forever home? Share their photo and we'll get their room ready! 🐾
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="relative rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all"
                style={{
                  border: `3px dashed ${dragOver ? "#e67e22" : "rgba(180,140,90,0.5)"}`,
                  background: dragOver ? "rgba(230,126,34,0.08)" : "rgba(255,252,245,0.7)",
                  minHeight: preview ? "auto" : "120px",
                  padding: "1rem",
                }}
              >
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                {preview ? (
                  <div className="flex flex-col items-center gap-2">
                    <img src={preview} alt="preview" className="rounded-xl object-contain shadow"
                      style={{ maxHeight: "clamp(100px, 30vw, 160px)", maxWidth: "100%" }} />
                    <p style={{ fontFamily: "'Quicksand', sans-serif", color: "#9a7a55", fontSize: "0.8rem" }}>Tap to pick a different photo 🔄</p>
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: "2rem" }}>📸</span>
                    <p style={{ fontFamily: "'Quicksand', sans-serif", color: "#9a7a55", fontSize: "clamp(0.8rem, 3vw, 0.9rem)", textAlign: "center", marginTop: "0.4rem" }}>
                      Drop a photo of your pet here!
                    </p>
                    <p style={{ fontFamily: "'Quicksand', sans-serif", color: "#b09070", fontSize: "0.72rem" }}>The cuter the better 🐱</p>
                  </>
                )}
              </div>
              <motion.button
                onClick={handleMoveIn}
                disabled={!file}
                whileHover={{ scale: !file ? 1 : 1.03 }}
                whileTap={{ scale: !file ? 1 : 0.97 }}
                className="w-full mt-4 rounded-2xl font-bold text-white"
                style={{
                  fontFamily: "'Fredoka One', cursive",
                  fontSize: "clamp(0.9rem, 4vw, 1rem)",
                  padding: "clamp(10px, 3vw, 14px)",
                  background: !file ? "#c8b89a" : "linear-gradient(135deg, #e67e22, #f39c12)",
                  border: "3px solid rgba(255,255,255,0.4)",
                  cursor: !file ? "not-allowed" : "pointer",
                  boxShadow: !file ? "none" : "0 4px 16px rgba(230,126,34,0.4)",
                }}
              >
                🏡 Move them in!
              </motion.button>
            </motion.div>
          ) : (
            /* ── STEP 2: Name input while sprites generate ── */
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.22 }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: "clamp(1.2rem, 5vw, 1.5rem)", color: "#7a4f2a" }}>
                  🌟 What's their name?
                </h2>
              </div>

              {/* Loading status */}
              <div
                className="flex items-center gap-2 rounded-2xl mb-4"
                style={{ background: "rgba(230,126,34,0.1)", border: "2px solid rgba(230,126,34,0.25)", padding: "0.65rem 1rem" }}
              >
                {spritesReady ? (
                  <>
                    <span style={{ fontSize: "1.2rem" }}>✅</span>
                    <p style={{ fontFamily: "'Quicksand', sans-serif", color: "#7a4f2a", fontSize: "0.82rem", fontWeight: 700 }}>
                      Room's ready! Just need a name 🏠
                    </p>
                  </>
                ) : (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                      style={{ display: "inline-block", fontSize: "1.1rem" }}
                    >
                      🐾
                    </motion.span>
                    <p style={{ fontFamily: "'Quicksand', sans-serif", color: "#9a7a55", fontSize: "0.82rem" }}>
                      {loadingMessages[loadingMsgIdx]}
                    </p>
                  </>
                )}
              </div>

              <label
                htmlFor="pet-name-input"
                style={{ fontFamily: "'Quicksand', sans-serif", color: "#9a7a55", fontSize: "clamp(0.78rem, 3vw, 0.85rem)", display: "block", marginBottom: "0.5rem" }}
              >
                Give your new friend a name while we get their room ready!
              </label>
              <input
                ref={nameInputRef}
                id="pet-name-input"
                type="text"
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (spritesReady || trimmedName)) handleConfirmName(); }}
                placeholder="e.g. Whiskers, Luna, Biscuit..."
                maxLength={24}
                style={{
                  width: "100%",
                  fontFamily: "'Quicksand', sans-serif",
                  fontSize: "clamp(0.85rem, 3.5vw, 0.95rem)",
                  color: "#5c3d1a",
                  background: "rgba(255,252,245,0.9)",
                  border: "2px solid rgba(180,140,90,0.5)",
                  borderRadius: "0.75rem",
                  padding: "0.55rem 0.85rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#e67e22")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(180,140,90,0.5)")}
              />
              {trimmedName && (
                <p style={{ fontFamily: "'Quicksand', sans-serif", color: "#e67e22", fontSize: "0.75rem", marginTop: "0.3rem" }}>
                  Aww, {trimmedName} is such a great name! ✨
                </p>
              )}

              <motion.button
                onClick={handleConfirmName}
                disabled={isGenerating && !spritesReady}
                whileHover={{ scale: isGenerating && !spritesReady ? 1 : 1.03 }}
                whileTap={{ scale: isGenerating && !spritesReady ? 1 : 0.97 }}
                className="w-full mt-4 rounded-2xl font-bold text-white"
                style={{
                  fontFamily: "'Fredoka One', cursive",
                  fontSize: "clamp(0.9rem, 4vw, 1rem)",
                  padding: "clamp(10px, 3vw, 14px)",
                  background: isGenerating && !spritesReady
                    ? "#c8b89a"
                    : "linear-gradient(135deg, #27ae60, #2ecc71)",
                  border: "3px solid rgba(255,255,255,0.4)",
                  cursor: isGenerating && !spritesReady ? "not-allowed" : "pointer",
                  boxShadow: isGenerating && !spritesReady ? "none" : "0 4px 16px rgba(39,174,96,0.4)",
                }}
              >
                {isGenerating && !spritesReady ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} style={{ display: "inline-block" }}>🐾</motion.span>
                    Almost ready...
                  </span>
                ) : (
                  `🏡 Welcome home, ${trimmedName || "Fluffy"}!`
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({ hunger: 75, happiness: 80, energy: 90, cleanliness: 85 });
  const [mood, setMood] = useState<CatMood>("idle");
  const [particles, setParticles] = useState<Particle[]>([]);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [sprites, setSprites] = useState<SpriteSet>(DEFAULT_SPRITES);
  const [petName, setPetName] = useState("Fluffy");
  const moodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => ({
        hunger: Math.max(0, prev.hunger - STAT_DECAY_RATE),
        happiness: Math.max(0, prev.happiness - STAT_DECAY_RATE * 0.7),
        energy: Math.max(0, prev.energy - STAT_DECAY_RATE * 0.5),
        cleanliness: Math.max(0, prev.cleanliness - STAT_DECAY_RATE * 0.4),
      }));
    }, STAT_DECAY_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (stats.energy < 15 && mood === "idle" && !isBusy) {
      setMood("sleeping");
      setActionMsg("Zzz... taking a nap...");
    }
  }, [stats.energy, mood, isBusy]);

  const spawnParticles = useCallback((x: number, y: number, emojis: string[], count = 6) => {
    const newParticles: Particle[] = Array.from({ length: count }, () => ({
      id: particleCounter++,
      x, y,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      vx: (Math.random() - 0.5) * 80,
      vy: -(Math.random() * 60 + 30),
    }));
    setParticles((prev) => [...prev, ...newParticles]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !newParticles.find((np) => np.id === p.id)));
    }, 1200);
  }, []);

  const showMsg = useCallback((msg: string) => {
    setActionMsg(msg);
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    msgTimerRef.current = setTimeout(() => setActionMsg(null), 2500);
  }, []);

  const doAction = useCallback((
    action: CatMood,
    statChanges: Partial<Stats>,
    emojis: string[],
    msg: string,
    duration = 2000
  ) => {
    if (isBusy) return;
    setIsBusy(true);
    setMood(action);
    showMsg(msg);
    setStats((prev) => ({
      hunger: Math.min(100, prev.hunger + (statChanges.hunger ?? 0)),
      happiness: Math.min(100, prev.happiness + (statChanges.happiness ?? 0)),
      energy: Math.min(100, prev.energy + (statChanges.energy ?? 0)),
      cleanliness: Math.min(100, prev.cleanliness + (statChanges.cleanliness ?? 0)),
    }));
    spawnParticles(50, 55, emojis, 8);
    if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
    moodTimerRef.current = setTimeout(() => { setMood("idle"); setIsBusy(false); }, duration);
  }, [isBusy, showMsg, spawnParticles]);

  const handleFeed  = () => doAction("eating",   { hunger: 30, happiness: 10 },              ["🐟","🍗","✨","😋"], "Nom nom nom! Yummy!", 2500);
  const handlePet   = () => doAction("happy",    { happiness: 25, energy: 5 },               ["💕","✨","💖","🌟"], "Purrrr... that feels nice!", 2000);
  const handlePlay  = () => doAction("happy",    { happiness: 30, energy: -15, hunger: -10 },["🎾","⭐","🌀","💫"], "Wheee! So fun!", 2500);
  const handleSleep = () => doAction("sleeping", { energy: 40, happiness: 5 },               ["💤","🌙","⭐","😴"], "Sweet dreams...", 4000);
  const handleBath  = () => doAction("happy",    { cleanliness: 40, happiness: -5 },         ["🛁","💧","✨","🫧"], "Squeaky clean! (Barely tolerated)", 2000);

  const overallMood = Math.round((stats.hunger + stats.happiness + stats.energy + stats.cleanliness) / 4);
  const moodLabel = overallMood > 80 ? "Blissful 😻" : overallMood > 60 ? "Content 😸" : overallMood > 40 ? "Okay 😺" : overallMood > 20 ? "Unhappy 😿" : "Miserable 🙀";
  const currentSprite = sprites[mood];

  return (
    /*
     * Root: full viewport height, flex column.
     * ┌─────────────────────────┐
     * │  scene  (flex-1, grows) │
     * ├─────────────────────────┤
     * │  UI panel  (fixed size) │
     * └─────────────────────────┘
     */
    <div
      className="flex flex-col w-full"
      style={{
        height: "100dvh",           /* dynamic viewport height — handles mobile browser chrome */
        background: "linear-gradient(135deg, #fdf6e3 0%, #faebd7 40%, #f5deb3 100%)",
        fontFamily: "'Quicksand', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ══════════════════════════════════════════
          SCENE — grows to fill all remaining space
          ══════════════════════════════════════════ */}
      <div className="relative flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Background */}
        <img
          src={BG_URL}
          alt="cozy room"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center 60%" }}
        />

        {/* Day/night overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: mood === "sleeping" ? "rgba(30,20,60,0.35)" : "rgba(255,240,200,0.05)",
            transition: "background 1s ease",
          }}
        />

        {/* Title — floats at top of scene */}
        <div
          className="absolute top-0 left-0 right-0 flex flex-col items-center pt-3 pb-2 pointer-events-none"
          style={{
            background: "linear-gradient(to bottom, rgba(253,246,227,0.85) 70%, transparent)",
            zIndex: 15,
          }}
        >
          <h1
            style={{
              fontFamily: "'Fredoka One', cursive",
              fontSize: "clamp(1.5rem, 6vw, 2.2rem)",
              color: "#7a4f2a",
              textShadow: "2px 3px 0px rgba(180,130,80,0.3)",
              letterSpacing: "0.02em",
              lineHeight: 1.1,
            }}
          >
            🐾 {petName}'s World 🐾
          </h1>
          <p style={{ color: "#9a7a55", fontSize: "clamp(0.7rem, 2.5vw, 0.85rem)", marginTop: "1px" }}>
            Your cozy companion
          </p>
        </div>

        {/* Mood badge — top right */}
        <div
          className="absolute top-3 right-3 rounded-full px-2.5 py-1 font-bold shadow"
          style={{
            background: "rgba(255,252,245,0.92)",
            border: "2px solid rgba(180,140,90,0.5)",
            color: "#7a4f2a",
            fontFamily: "'Fredoka One', cursive",
            fontSize: "clamp(0.6rem, 2.2vw, 0.75rem)",
            zIndex: 20,
          }}
        >
          {moodLabel}
        </div>

        {/* Change Pet button — top left */}
        <motion.button
          onClick={() => setShowUpload(true)}
          whileHover={{ scale: 1.07 }}
          whileTap={{ scale: 0.93 }}
          className="absolute top-3 left-3 flex items-center gap-1 rounded-full font-bold shadow-md"
          style={{
            background: "rgba(255,252,245,0.95)",
            border: "2px solid rgba(180,140,90,0.5)",
            color: "#7a4f2a",
            fontFamily: "'Fredoka One', cursive",
            fontSize: "clamp(0.6rem, 2.2vw, 0.75rem)",
            padding: "clamp(4px, 1.2vw, 6px) clamp(8px, 2.2vw, 12px)",
            cursor: "pointer",
            zIndex: 20,
          }}
        >
          <span>🏠</span> Adopt a Pet
        </motion.button>

        {/* Cat Sprite — centred in scene, sits near the bottom */}
        <motion.div
          className="absolute"
          style={{
            bottom: "10%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "clamp(130px, 30vw, 240px)",
            zIndex: 10,
          }}
          animate={
            mood === "idle" ? { y: [0, -8, 0] }
            : mood === "sleeping" ? { y: [0, -3, 0] }
            : { y: [0, -12, 0] }
          }
          transition={{
            duration: mood === "sleeping" ? 3 : mood === "idle" ? 2.5 : 0.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.img
              key={`${mood}-${currentSprite}`}
              src={currentSprite}
              alt={`cat ${mood}`}
              className="w-full h-auto drop-shadow-xl"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ duration: 0.25 }}
            />
          </AnimatePresence>
        </motion.div>

        {/* Speech bubble */}
        <AnimatePresence>
          {actionMsg && (
            <motion.div
              key={actionMsg}
              initial={{ scale: 0, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: -10 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="absolute rounded-2xl px-3 py-1.5 font-bold shadow-lg"
              style={{
                bottom: "38%",
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(255,252,245,0.97)",
                border: "2px solid rgba(180,140,90,0.6)",
                color: "#5c3d1a",
                fontFamily: "'Quicksand', sans-serif",
                fontSize: "clamp(0.7rem, 2.8vw, 0.85rem)",
                whiteSpace: "nowrap",
                zIndex: 20,
                maxWidth: "85%",
                textAlign: "center",
              }}
            >
              {actionMsg}
              <div
                style={{
                  position: "absolute",
                  bottom: "-9px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0, height: 0,
                  borderLeft: "7px solid transparent",
                  borderRight: "7px solid transparent",
                  borderTop: "9px solid rgba(180,140,90,0.6)",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating particles */}
        <AnimatePresence>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute pointer-events-none select-none"
              style={{ left: `${p.x}%`, top: `${p.y}%`, fontSize: "clamp(1rem, 4vw, 1.4rem)", zIndex: 30 }}
              initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              animate={{ opacity: 0, x: p.vx, y: p.vy, scale: 1.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            >
              {p.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ══════════════════════════════════════════
          UI PANEL — fixed height, always at bottom
          ══════════════════════════════════════════ */}
      <div
        className="flex-shrink-0 w-full"
        style={{
          background: "rgba(253,246,227,0.98)",
          borderTop: "3px solid rgba(180,140,90,0.4)",
          boxShadow: "0 -4px 20px rgba(180,130,80,0.15)",
        }}
      >
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 pt-3 pb-2">
          <StatBar label="Hunger"      value={stats.hunger}      color="linear-gradient(90deg,#e67e22,#f39c12)" icon="🍗" />
          <StatBar label="Happiness"   value={stats.happiness}   color="linear-gradient(90deg,#e91e8c,#ff6bb5)" icon="💖" />
          <StatBar label="Energy"      value={stats.energy}      color="linear-gradient(90deg,#3498db,#74b9ff)" icon="⚡" />
          <StatBar label="Cleanliness" value={stats.cleanliness} color="linear-gradient(90deg,#27ae60,#55efc4)" icon="✨" />
        </div>

        {/* Thin divider */}
        <div style={{ height: "2px", background: "linear-gradient(90deg,transparent,rgba(180,140,90,0.35),transparent)", margin: "0 1rem" }} />

        {/* Action buttons */}
        <div className="flex gap-2 px-3 py-2.5">
          <ActionButton emoji="🍗" label="Feed"  onClick={handleFeed}  color="#e67e22" disabled={isBusy} />
          <ActionButton emoji="🤗" label="Pet"   onClick={handlePet}   color="#e91e8c" disabled={isBusy} />
          <ActionButton emoji="🎾" label="Play"  onClick={handlePlay}  color="#9b59b6" disabled={isBusy} />
          <ActionButton emoji="😴" label="Sleep" onClick={handleSleep} color="#3498db" disabled={isBusy} />
          <ActionButton emoji="🛁" label="Bath"  onClick={handleBath}  color="#27ae60" disabled={isBusy} />
        </div>

        {/* Footer hint + safe-area spacer */}
        <div
          className="text-center pb-2"
          style={{
            color: "#b09070",
            fontFamily: "'Quicksand', sans-serif",
            fontSize: "clamp(0.6rem, 2.2vw, 0.72rem)",
            paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
          }}
        >
          Keep your pet happy, fed, and well-rested! 🐾
        </div>
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUpload && (
          <UploadModal
            onClose={() => setShowUpload(false)}
            onSpritesGenerated={(newSprites, name) => { setSprites(newSprites); setPetName(name); setMood("idle"); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
