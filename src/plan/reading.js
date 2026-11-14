// Время чтения: сколько секунд текст должен быть ПОЛНОСТЬЮ виден, чтобы его успели прочитать.
// ~15 знаков/с + 0.6 с на реакцию; в «высокой» динамичности допуск 0.9 (зритель ждёт быстрого монтажа).
export const readSec = (text, P) => (0.6 + [...String(text)].length / 15) * (P?.id === 'high' ? 0.9 : 1);
export const READING_RULE = 'on-screen text must stay fully visible for about 0.6 s + 1 s per 15 characters (x0.9 in high) before the scene ends or the next transition starts';
