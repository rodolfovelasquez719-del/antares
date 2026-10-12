// Trabajador: Antares piensa su jugada de damas sin congelar la pantalla.
import { aiMove } from "./draughts.js";
self.onmessage = (e) => { const { id, game, difficulty } = e.data; let move = null; try { move = aiMove(game, difficulty); } catch {} self.postMessage({ id, move }); };
