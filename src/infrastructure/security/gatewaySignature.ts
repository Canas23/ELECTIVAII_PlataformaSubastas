import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Contrato de firma de la pasarela de pagos.
 *
 * Cabecera:  X-Gateway-Signature: t=<unix-segundos>,v1=<hex>
 * Firma:     HMAC-SHA256(secreto, `${t}.${cuerpoCrudo}`)
 *
 * Incluir el instante en la firma impide reutilizar una notificación
 * capturada mucho tiempo después (ataque de repetición).
 */
export const SIGNATURE_HEADER = 'x-gateway-signature';

export function computeSignature(secret: string, timestamp: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function buildSignatureHeader(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${computeSignature(secret, timestamp, rawBody)}`;
}

export function parseSignatureHeader(header: string): { timestamp: number; signature: string } | null {
  const parts = new Map(
    header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key ?? '', rest.join('=')] as const;
    }),
  );
  const timestamp = Number(parts.get('t'));
  const signature = parts.get('v1');
  if (!Number.isInteger(timestamp) || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return null;
  return { timestamp, signature };
}

export function signaturesMatch(expectedHex: string, receivedHex: string): boolean {
  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(receivedHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
