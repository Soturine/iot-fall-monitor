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
- `fix(pairing): corrige validação de backend api base url no portal`
- `fix(frontend): corrige fluxo de pairing no modal`
- `refactor(firmware): modulariza setup portal sem alterar rotas`
- `perf(backend): reduz ruído de logs do socket`
- `docs(infra): atualiza quickstart e regras de ambiente`

## Regras adicionais
- commits pequenos e rastreaveis
- evitar commit genérico tipo "update" ou "ajustes"
- separar mudança funcional de mudança documental quando fizer sentido
- preferir um commit por escopo logico, se não houver risco de fragmentar demais
