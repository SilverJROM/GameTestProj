// Stub only. The live room (P10 onward) replaces this class. It exists so wrangler can bind WorldRoom.
import { DurableObject } from 'cloudflare:workers';

export class WorldRoom extends DurableObject {
  // No routes yet; the room is not implemented in P7.
}
