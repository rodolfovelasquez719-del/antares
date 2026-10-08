// Modo Robótica: ruta de aprendizaje para construir su propio robot, ideas de proyectos por nivel y el tutor del chat.
// Contenido fijo (sin compras ni enlaces a tiendas); el avance se guarda cifrado si hay código.
import { memory } from "./memory.js";

export const K_ROBOTICS = "antares.robotics.v1";

export const ROADMAP = [
  { id: "n1", level: "Nivel 1", title: "Fundamentos de electrónica y Arduino", weeks: "2 a 4 semanas", steps: [
    { id: "n1-ohm", t: "Voltaje, corriente y la ley de Ohm", d: "V = I × R. Calcule la resistencia de un LED: (5 V − 2 V) / 0,02 A ≈ 150 Ω (use 220 Ω)." },
    { id: "n1-proto", t: "Protoboard, resistencias y multímetro", d: "Arme circuitos sin soldar y mida voltaje y continuidad antes de energizar." },
    { id: "n1-ide", t: "Arduino Uno y el IDE de Arduino", d: "setup() corre una vez y loop() se repite. Su primer programa: parpadear el LED del pin 13." },
    { id: "n1-io", t: "Entradas y salidas digitales", d: "Botón con resistencia pull-up (INPUT_PULLUP) que enciende un LED." },
    { id: "n1-pwm", t: "PWM y entradas analógicas", d: "analogWrite() para el brillo de un LED; analogRead() con un potenciómetro (0 a 1023)." },
    { id: "n1-serial", t: "Monitor serie para depurar", d: "Serial.begin(9600) y Serial.println() para ver qué está pasando." },
  ] },
  { id: "n2", level: "Nivel 2", title: "Sensores y motores", weeks: "3 a 5 semanas", steps: [
    { id: "n2-us", t: "Sensor ultrasónico HC-SR04", d: "Mide distancia con el eco: distancia (cm) ≈ duración (µs) / 58." },
    { id: "n2-ir", t: "Sensores infrarrojos de línea y obstáculos", d: "Leen blanco/negro para seguir una línea; calíbrelos con el potenciómetro del módulo." },
    { id: "n2-servo", t: "Servomotores (SG90, MG996R)", d: "Biblioteca Servo: posiciones de 0 a 180°. Aliméntelos aparte si usa varios." },
    { id: "n2-dc", t: "Motores DC con driver (L298N o TB6612FNG)", d: "Nunca conecte un motor directo al Arduino: el driver da la corriente y permite girar en ambos sentidos." },
    { id: "n2-power", t: "Alimentación y baterías", d: "Tierra común entre Arduino y driver. Con LiPo o 18650: cargador adecuado, nunca perforar ni descargar de más." },
    { id: "n2-imu", t: "IMU (MPU6050) y encoders", d: "Acelerómetro y giroscopio para orientación; encoders para medir cuánto giró cada rueda." },
  ] },
  { id: "n3", level: "Nivel 3", title: "Su primer robot móvil", weeks: "4 a 6 semanas", steps: [
    { id: "n3-chassis", t: "Chasis 2WD o 4WD", d: "Dos motores con rueda loca son lo más sencillo para empezar." },
    { id: "n3-avoid", t: "Robot que evita obstáculos", d: "Ultrasónico al frente sobre un servo: si hay algo a menos de 20 cm, gira hacia el lado más libre." },
    { id: "n3-line", t: "Seguidor de línea con control P/PID", d: "Corrija la dirección según el error de los sensores; ajuste Kp primero, luego Kd." },
    { id: "n3-bt", t: "Control remoto por Bluetooth", d: "Módulo HC-05 o el Bluetooth del ESP32, controlado desde una app del celular." },
    { id: "n3-states", t: "Máquina de estados", d: "Organice el comportamiento en estados (buscar, avanzar, evitar, detenerse) en vez de muchos if anidados." },
  ] },
  { id: "n4", level: "Nivel 4", title: "ESP32, IoT y visión", weeks: "4 a 8 semanas", steps: [
    { id: "n4-esp32", t: "ESP32: WiFi y Bluetooth integrados", d: "Se programa con el mismo IDE de Arduino; trabaja a 3,3 V (cuidado con sensores de 5 V)." },
    { id: "n4-web", t: "Control desde el navegador del celular", d: "Un servidor web en el ESP32 con botones para mover el robot." },
    { id: "n4-mpy", t: "MicroPython (opcional)", d: "Python en el microcontrolador: rápido para experimentar." },
    { id: "n4-cam", t: "ESP32-CAM", d: "Transmita video del robot por WiFi; base para visión por computadora." },
    { id: "n4-freertos", t: "Tareas en paralelo (FreeRTOS)", d: "Leer sensores y controlar motores al mismo tiempo sin bloquear el loop." },
  ] },
  { id: "n5", level: "Nivel 5", title: "ROS 2 y robots autónomos", weeks: "2 a 4 meses", steps: [
    { id: "n5-linux", t: "Linux y Raspberry Pi", d: "Terminal, archivos, SSH. Ubuntu es el sistema más usado con ROS 2." },
    { id: "n5-ros", t: "Conceptos de ROS 2", d: "Nodos que se comunican por tópicos (publicar/suscribir), servicios y acciones." },
    { id: "n5-sim", t: "Simulación con Gazebo y RViz", d: "Pruebe su robot en la computadora antes de arriesgar el hardware." },
    { id: "n5-microros", t: "micro-ROS en el ESP32", d: "El ESP32 maneja motores y sensores y habla con ROS 2 en la Raspberry Pi." },
    { id: "n5-slam", t: "Mapeo y navegación (SLAM, Nav2)", d: "Con un LIDAR el robot dibuja un mapa de la casa y se mueve solo a un punto." },
  ] },
];

export const PROJECTS = [
  { level: "Principiante", items: [
    "Semáforo con tres LEDs y un botón de peatón.",
    "Alarma con sensor ultrasónico y zumbador.",
    "Termómetro con pantalla LCD o OLED.",
  ] },
  { level: "Intermedio", items: [
    "Carrito que evita obstáculos con servo «cabeza».",
    "Seguidor de línea con control PID para una pista en el piso.",
    "Brazo robótico de 4 servos controlado con potenciómetros.",
  ] },
  { level: "Avanzado", items: [
    "Robot con ESP32-CAM manejado desde el celular por WiFi.",
    "Robot que dibuja el mapa de la casa con LIDAR y ROS 2.",
    "Su propio robot asistente: ruedas, sensores, cámara y voz que converse con Antares.",
  ] },
];

export const TUTOR_SYSTEM =
  "Modo tutor de robótica: usted es el tutor personal de Freddy, cuyo sueño es construir su propio robot. " +
  "Explique paso a paso, de forma práctica y en español de usted, partiendo de lo básico (electrónica, Arduino, ESP32, " +
  "sensores, motores y drivers, alimentación, programación en C++ de Arduino o MicroPython, y nociones de ROS 2). " +
  "Cuando ayude, dé un ejemplo de código corto y comentado y un diagrama de conexiones en texto (pin a pin). " +
  "Advierta los riesgos reales (baterías LiPo, voltajes, cortocircuitos, 3,3 V frente a 5 V). Si no está seguro de un dato " +
  "técnico, dígalo. No recomiende tiendas, marcas para comprar ni precios; nombre los componentes de forma genérica. " +
  "Termine con un pequeño reto práctico para el siguiente paso.";

export const tutorPrompt = (text) => text;

export function loadProgress() {
  const d = memory.getData(K_ROBOTICS, null);
  return d && typeof d === "object" && d.done ? d : { done: {} };
}
export function toggleStep(id) {
  const p = loadProgress();
  const done = { ...p.done };
  if (done[id]) delete done[id]; else done[id] = Date.now();
  return { res: memory.saveData(K_ROBOTICS, { ...p, done }), done };
}
export function progressStats(done = loadProgress().done) {
  const all = ROADMAP.flatMap((l) => l.steps);
  const n = all.filter((s) => done[s.id]).length;
  const next = all.find((s) => !done[s.id]) || null;
  return { n, total: all.length, pct: Math.round((n / all.length) * 100), next };
}

export const looksLikeTutorOn = (t) => /\b(?:modo\s+(?:rob[oó]tica|tutor)|tutor\s+de\s+rob[oó]tica|active\s+(?:el\s+)?(?:modo\s+)?tutor)\b/i.test(t) && !/\b(?:salir|desactive|apague|quite)\b/i.test(t);
export const looksLikeTutorOff = (t) => /\b(?:salir|salga|desactive|apague|quite|termine)\b.*\b(?:modo\s+)?tutor\b|\bsalir\s+del\s+modo\s+rob[oó]tica\b/i.test(t);
