import type { ButtonHTMLAttributes } from 'react';
import type { PermissionKey } from '../../model/types';
import { permHint, useAct } from '../act';

// Botão ligado a uma permissão: some o clique se bloqueado e marca com um
// ponto âmbar quando a ação vai virar pedido ao mestre.
export default function ActButton({
  perm: key, className = 'btn btn-sm', children, title, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { perm: PermissionKey }) {
  const { perm } = useAct();
  const p = perm(key);
  return (
    <button
      className={className}
      disabled={disabled || p === 'blocked'}
      title={permHint(p) ?? title}
      {...rest}
    >
      {children}
      {p === 'request' && <span className="req-dot" aria-label="pede aprovação" />}
    </button>
  );
}
