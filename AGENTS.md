# AGENTS

## Papel do agente
- trabalhar de forma conservadora
- preservar compatibilidade
- evitar refatoracao excessiva fora do escopo
- nao quebrar contratos de API, payloads, topicos MQTT, schema ou fluxos criticos sem pedido explicito

## Leitura obrigatoria antes de mexer
- ler `README.md`, `CHANGELOG.md` e qualquer `AGENTS.md` aplicavel
- identificar arquitetura e arquivos realmente impactados
- resumir o plano antes de mudancas grandes

## Escopo e precedencia
- seguir a logica de escopo por diretorio
- permitir que `AGENTS.md` mais internos complementem regras da raiz
- em caso de conflito, o mais especifico vence
- instrucoes do usuario tem precedencia sobre `AGENTS.md`

## Regras de Git
- nao criar branch nova sem pedido explicito
- usar git para commitar mudancas
- nao alterar commits antigos
- nao usar force push
- verificar `git status` ao final
- deixar o worktree limpo

## Regras de seguranca
- nunca subir `.env`, credenciais, chaves, tokens, dumps ou dados sensiveis
- respeitar `.gitignore`
- nunca incluir `node_modules`, `.pio`, `dist`, logs, caches, backups, arquivos compactados ou artefatos gerados

## Regras de validacao
- rodar os checks programaticos disponiveis para o escopo alterado
- se nao puder rodar algum check, explicar exatamente por que
- registrar validacao no relatorio final e no corpo do commit

## Estrutura do relatorio final
- resumo do que foi feito
- arquivos criados
- arquivos alterados
- validacoes executadas
- riscos restantes
- pendencias
- hash curto do commit
- mensagem de commit usada
- confirmacao de worktree limpo
- sugestao de proximo passo
