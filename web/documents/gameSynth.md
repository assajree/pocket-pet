# Game synth: `playSynthSequence` and note durations

Documentation for [`web/helpers/gameSynth.js`](../web/helpers/gameSynth.js).

## Imports

From a file under `web/scenes/`:

```javascript
import {
  createGameSynth,
  NOTE_DURATION_MS,
  NOTE_BEATS,
  NOTE_REFERENCE_BPM
} from "../helpers/gameSynth.js";
```

Adjust the relative path if your file is not in `web/scenes/`.

## `createGameSynth()`

Returns an API object:

- **`unlock()`** — Resumes the `AudioContext` when it is `suspended` (common before a user gesture). Returns `Promise<boolean>`.
- **`playButtonPress(button)`** — Short UI tones.
- **`playEvolutionCue(previousStage)`** — Evolution / hatch fanfare.
- **`playSynthSequence(notes)`** — Plays a sequence of named notes (or rests) with millisecond durations.

Prefer calling **`unlock()`** once after a tap or click if you need the first sequence to play immediately. If the context is still suspended, `playSynthSequence` schedules an internal `unlock()` and retries the same call so playback can start after resume.

## `playSynthSequence(notes)`

`notes` must be a non-empty array. Each element is an object:

| Field      | Required | Description |
| ---------- | -------- | ----------- |
| `note`     | yes      | Note name: one letter `a`–`g`, then only `#` and/or `b` for accidentals (e.g. `c#`, `bb`). Use **`"-"`** (or an empty string) for a **rest**: no oscillator, but **`duration` still advances the schedule**. |
| `octave`   | no       | Octave number. If missing or not a finite number, it defaults as in code (clamped to range **1–5**, default **3**). |
| `duration` | no       | Note length in **milliseconds**. If omitted, defaults to **300**. |

The **next** entry starts when the **previous** `duration` has elapsed, including rests and entries where `note` does not parse to a pitch (no sound, time still moves).

## `NOTE_REFERENCE_BPM`, `NOTE_BEATS`, and `NOTE_DURATION_MS`

- **`NOTE_REFERENCE_BPM`** — Reference tempo (**120**): one quarter note per beat.
- **`NOTE_BEATS`** — Symbolic note lengths in **quarter-note beats** (4/4). Quarter = **1** beat; dotted names are **1.5×** the base note.
- **`NOTE_DURATION_MS`** — Same keys as **`NOTE_BEATS`**, values in **ms** at **`NOTE_REFERENCE_BPM`**. Use these directly as **`duration`** in `playSynthSequence`.

### Example

```javascript
const synth = createGameSynth();

synth.playSynthSequence([
  { note: "c", octave: 4, duration: NOTE_DURATION_MS.quarter },
  { note: "e", octave: 4, duration: NOTE_DURATION_MS.eighth },
  { note: "-", duration: NOTE_DURATION_MS.eighth },
  { note: "g", octave: 4, duration: NOTE_DURATION_MS.quarter }
]);
```

## Other tempos

For a different BPM, convert beats to milliseconds:

```javascript
const bpm = 96;
const halfNoteMs = (NOTE_BEATS.half * 60000) / bpm;
```

General formula: **`(NOTE_BEATS.<name> * 60000) / bpm`**.
