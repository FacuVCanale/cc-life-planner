---
description: Captura una tarea o goal en formato canónico
argument-hint: "<descripción libre de la tarea o goal>"
---

Cargá la skill `capturador`.

**Entrada**: $ARGUMENTS (texto libre describiendo una tarea, un goal, o una nota suelta).

**Pasos**:
1. Decidí qué tipo de captura es: tarea concreta, goal (corto/mediano/largo), o item ambiguo.
2. Si es **tarea**: aplicá el formato de `state/tasks.md` (id, deadline, estimación, energía, dependencias). Si falta deadline o estimación, preguntá una vez; si el usuario no sabe, mandala a `state/inbox.md` con timestamp.
3. Si es **goal**: agregalo a `state/goals.md` bajo el horizonte correcto (corto/mediano/largo). Siempre con deadline si es corto plazo.
4. Si es **ambiguo o nota**: a `state/inbox.md` con timestamp ISO. El usuario después corre `/capturar` sobre el item del inbox para procesarlo.
5. Confirmá al usuario en el chat dónde quedó y con qué formato.

**Importante**: nunca inventes deadlines. Si no hay info, preguntá o usá inbox.
