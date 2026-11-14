"""
Unifica duas contas do mesmo dono num banco SQLite do Minha Mente (feito para a duplicação de 05/11/2026).

Causa: o @ da conta de administrador original foi trocado no banco (de e-mail para "atsu"); o login seguinte procurou
a conta pelo e-mail do .env, não achou e criou outra conta de administrador. Desde então, posts, conversas, memórias e
documentos novos foram para a duplicada. O login agora acha a conta pelo papel do .env (src/server/users.ts).

O que faz, numa transação só (ou nada muda):
  1. move para a conta que fica tudo o que aponta para a duplicada (posts, conversas, memórias, documentos, trechos
     indexados, convites, ambientes de que ela é dona);
  2. participações: onde as duas participam, fica o papel mais alto na conta que fica; nos outros ambientes, a
     participação passa para ela;
  3. ajusta o nome de exibição (e, se pedido, o @) da conta que fica;
  4. apaga a conta duplicada, já sem nada apontando para ela;
  5. confere que nenhuma referência ficou para trás e que as contagens somam.

Antes de mudar qualquer coisa, grava um backup consistente do banco (API de backup do SQLite) ao lado dele.

Uso:
  python scripts/unificar-contas.py BANCO --fica ID --sai ID [--nome "Atsu"] [--usuario atsu] [--aplicar]
Sem --aplicar, só mostra o que faria (simulação), sem backup e sem mudanças.
"""

import argparse
import datetime
import os
import sqlite3
import sys

# (tabela, coluna) que apontam para User.id; Membership tratada à parte.
REFS = [
    ("Post", "authorId"),
    ("KallyConversation", "userId"),
    ("KallyMemory", "userId"),
    ("KallyDocument", "userId"),
    ("KallyChunk", "userId"),
    ("Invite", "createdById"),
    ("Environment", "ownerId"),
]
RANK = {"OWNER": 3, "ADMIN": 2, "MEMBER": 1, "VIEWER": 0}


def fks_to_user(con):
    """Todas as colunas com chave estrangeira para User, para conferir que a lista acima está completa."""
    found = set()
    for (table,) in con.execute("select name from sqlite_master where type='table'"):
        for row in con.execute(f'pragma foreign_key_list("{table}")'):
            if row[2] == "User":
                found.add((table, row[3]))
    return found


def count(con, user_id):
    out = {f"{t}.{c}": con.execute(f'select count(*) from "{t}" where "{c}"=?', (user_id,)).fetchone()[0] for t, c in REFS}
    out["Membership.userId"] = con.execute('select count(*) from "Membership" where userId=?', (user_id,)).fetchone()[0]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("banco")
    ap.add_argument("--fica", required=True, help="id da conta que fica (a original)")
    ap.add_argument("--sai", required=True, help="id da conta duplicada")
    ap.add_argument("--nome", help="nome de exibição da conta que fica")
    ap.add_argument("--usuario", help="@ da conta que fica")
    ap.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    con = sqlite3.connect(args.banco, isolation_level=None)
    con.execute("pragma foreign_keys=ON")
    keep = con.execute('select id, username, displayName, legacyKind from "User" where id=?', (args.fica,)).fetchone()
    gone = con.execute('select id, username, displayName, legacyKind from "User" where id=?', (args.sai,)).fetchone()
    if not keep or not gone:
        sys.exit("Conta não encontrada (confira os ids).")
    print("Fica:", keep)
    print("Sai: ", gone)

    missing = fks_to_user(con) - set(REFS) - {("Membership", "userId")}
    if missing:
        sys.exit(f"Há referências a User que este script não trata: {sorted(missing)}. Nada foi feito.")

    before_keep, before_gone = count(con, args.fica), count(con, args.sai)
    print("\nAntes (fica / sai):")
    for k in before_keep:
        print(f"  {k}: {before_keep[k]} / {before_gone[k]}")

    plan = []
    for env_id, role in con.execute('select environmentId, role from "Membership" where userId=?', (args.sai,)).fetchall():
        mine = con.execute('select role from "Membership" where environmentId=? and userId=?', (env_id, args.fica)).fetchone()
        if mine:
            best = role if RANK[role] > RANK[mine[0]] else mine[0]
            plan.append(("merge", env_id, mine[0], role, best))
        else:
            plan.append(("move", env_id, None, role, role))
    print("\nParticipações da conta que sai:")
    for kind, env_id, mine, theirs, best in plan:
        print(f"  {env_id}: " + (f"as duas participam (fica {mine}, sai {theirs}) -> fica {best}" if kind == "merge" else f"passa para a conta que fica ({theirs})"))
    if args.nome or args.usuario:
        print(f"\nConta que fica: nome de exibição -> {args.nome or keep[2]!r}, @ -> {args.usuario or keep[1]!r}")

    if not args.aplicar:
        print("\nSimulação: nada foi mudado. Rode com --aplicar para unificar.")
        return

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = f"{os.path.splitext(args.banco)[0]}.backup-{stamp}-antes-unificar.db"
    with sqlite3.connect(backup_path) as dest:
        con.backup(dest)
    print(f"\nBackup: {backup_path}")

    try:
        con.execute("begin immediate")
        for t, c in REFS:
            con.execute(f'update "{t}" set "{c}"=? where "{c}"=?', (args.fica, args.sai))
        for kind, env_id, _mine, _theirs, best in plan:
            if kind == "merge":
                con.execute('update "Membership" set role=? where environmentId=? and userId=?', (best, env_id, args.fica))
                con.execute('delete from "Membership" where environmentId=? and userId=?', (env_id, args.sai))
            else:
                con.execute('update "Membership" set userId=? where environmentId=? and userId=?', (args.fica, env_id, args.sai))
        # O @ da duplicada pode ser o que a conta que fica vai usar: a duplicada sai antes.
        left = count(con, args.sai)
        if any(left.values()):
            raise RuntimeError(f"Sobrou referência à conta que sai: {left}")
        con.execute('delete from "User" where id=?', (args.sai,))
        now = int(datetime.datetime.now().timestamp() * 1000)
        if args.nome:
            con.execute('update "User" set displayName=?, updatedAt=? where id=?', (args.nome, now, args.fica))
        if args.usuario:
            con.execute('update "User" set username=?, updatedAt=? where id=?', (args.usuario.strip().lower(), now, args.fica))
        after = count(con, args.fica)
        for t, c in REFS:
            key = f"{t}.{c}"
            if after[key] != before_keep[key] + before_gone[key]:
                raise RuntimeError(f"Contagem de {key} não fecha: {before_keep[key]} + {before_gone[key]} != {after[key]}")
        broken = con.execute("pragma foreign_key_check").fetchall()
        if broken:
            raise RuntimeError(f"Chaves estrangeiras quebradas: {broken[:5]}")
        con.execute("commit")
    except Exception as error:
        con.execute("rollback")
        sys.exit(f"Desfeito (nada mudou): {error}")

    print("\nDepois (conta que fica):")
    for k, v in count(con, args.fica).items():
        print(f"  {k}: {v}")
    print("Conta que fica agora:", con.execute('select id, username, displayName, legacyKind from "User" where id=?', (args.fica,)).fetchone())
    print("Unificado.")


if __name__ == "__main__":
    main()
