import { Clock, WebhookSignatureVerifier } from '../../application/ports/services';
import { computeSignature, parseSignatureHeader, signaturesMatch } from './gatewaySignature';

/** RN-18 / RF-19: verifica que la notificación provenga de la pasarela. */
export class HmacWebhookSignatureVerifier implements WebhookSignatureVerifier {
  constructor(
    private readonly secret: string,
    private readonly toleranceSeconds: number,
    private readonly clock: Clock,
  ) {}

  verify(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;
    const parsed = parseSignatureHeader(signatureHeader);
    if (!parsed) return false;

    const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
    if (Math.abs(nowSeconds - parsed.timestamp) > this.toleranceSeconds) return false;

    const expected = computeSignature(this.secret, parsed.timestamp, rawBody);
    return signaturesMatch(expected, parsed.signature);
  }
}
