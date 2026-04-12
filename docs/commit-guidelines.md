# Commit Guidelines

## Tipos permitidos
- `feat`
- `fix`
- `refactor`
- `perf`
- `docs`
- `chore`
- `build`
- `test`

## Escopos permitidos
- `firmware`
- `backend`
- `frontend`
- `database`
- `docs`
- `scripts`
- `mqtt`
- `pairing`
- `security`
- `infra`

## Formato obrigatorio do commit
Titulo:
`tipo(escopo): resumo curto`

Corpo:
- `Contexto:`
- `Alteracoes:`
- `Validacao:`
- `Riscos/Pendencias:`

## Exemplos obrigatorios
- `fix(pairing): corrige validacao de backend api base url no portal`
- `fix(frontend): corrige fluxo de pairing no modal`
- `refactor(firmware): modulariza setup portal sem alterar rotas`
- `perf(backend): reduz ruido de logs do socket`
- `docs(infra): atualiza quickstart e regras de ambiente`

## Regras adicionais
- commits pequenos e rastreaveis
- evitar commit generico tipo "update" ou "ajustes"
- separar mudanca funcional de mudanca documental quando fizer sentido
- preferir um commit por escopo logico, se nao houver risco de fragmentar demais
