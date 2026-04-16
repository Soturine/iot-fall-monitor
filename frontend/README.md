# Frontend do Sistema Queda

Dashboard web responsivo para autenticacao, operacao multi-tenant, gestao de pacientes, devices pareados, alertas e tempo real.

## Stack

- `React`
- `Vite`
- `TypeScript`
- `Tailwind CSS`
- `React Router`
- `Axios`
- `Socket.IO Client`
- `Recharts`

Ambiente de desenvolvimento recomendado nesta fase:

- `Node.js 20+`

## Estrutura

```text
frontend/
  public/
  src/
    components/
    contexts/
    lib/
    pages/
    services/
    types/
  .env.example
  package.json
  vite.config.ts
```

## Variaveis de ambiente

```env
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
```

O frontend agora normaliza essas URLs em `src/config/runtime.ts`, evitando problemas simples com barra final duplicada e mantendo a base da API e do `Socket.IO` coerentes.

## Scripts

- `npm run dev`: inicia o Vite
- `npm run build`: gera o build de producao
- `npm run preview`: serve o build localmente
- `npm run lint`: lint do projeto

## Estabilizacao e performance local

Nesta rodada, o frontend recebeu uma passada de estabilizacao para o modelo multi-tenant:

- rotas principais agora usam carregamento sob demanda para reduzir o bundle inicial
- o contexto `Socket.IO` foi ajustado para reconectar de forma mais limpa quando token ou organizacao ativa mudam
- o modal de edicao de device foi corrigido para nao reciclar estado antigo entre dispositivos diferentes
- o dashboard voltou a renderizar corretamente o paciente dos eventos recentes vindos do backend

## Fluxo de autenticacao

A tela `/login` agora suporta dois caminhos diferentes:

- `Entrar`: usar um usuario ja vinculado a uma organizacao
- `Criar conta`: criar uma nova organizacao e autenticar o `organization_admin` inicial

Regras atuais:

- se `database/seed.sql` foi aplicado, existe o acesso demo `admin@queda.local / Admin@123`
- o cadastro nao cria mais apenas um usuario solto; ele cria tambem a organizacao inicial
- o token JWT e salvo em `localStorage`
- a organizacao ativa tambem fica salva localmente
- as rotas internas continuam protegidas por `ProtectedRoute`
- a sidebar mostra `Sair` e `Trocar usuario`
- `Sair` limpa a sessao local e derruba o `Socket.IO`
- `/login?force=1` permite voltar ao formulario de login mesmo com sessao ativa

## Organizacao ativa e escopo

Depois do login, a sidebar mostra:

- nome da organizacao ativa
- papel do usuario naquela organizacao
- seletor de organizacao quando o usuario possui mais de uma membership
- mensagem explicita quando a sessao possui apenas uma organizacao ativa ou quando nao ha membership trocavel

O frontend envia `X-Organization-Id` automaticamente para a API e tambem informa `organizationId` no handshake do `Socket.IO`.

Isso significa que:

- o dashboard deixa de ser global
- listas de pacientes, devices, alertas e eventos passam a refletir apenas o tenant ativo
- o frontend depende do backend filtrado e nao tenta resolver seguranca apenas escondendo componentes

## Reidratacao de sessao e recuperacao de erro

O `AuthProvider` agora:

- normaliza sessao salva no `localStorage` antes de usar os dados em memoria
- reidrata o usuario autenticado com `GET /api/me` no boot
- limpa a sessao automaticamente se o token estiver invalido ou se o navegador estiver preso a um shape antigo de autenticacao

Tambem existe um `AppErrorBoundary` no topo da arvore:

- ele evita tela branca total em erro de renderizacao
- mostra a mensagem tecnica basica
- oferece o atalho `Limpar sessao local e abrir login`

Esse fluxo foi adicionado porque a migracao para multi-tenant pode deixar navegadores com `user` antigo salvo, sem `memberships`, o que antes derrubava toda a interface.

## Paginas implementadas

- `/login`
- `/dashboard`
- `/patients`
- `/devices`
- `/devices/:id`
- `/alerts`
- `/organization`
- rota `404`

## O que cada tela mostra

- `login`: entrar com usuario existente ou criar uma nova organizacao
- `dashboard`: metricas, dispositivos, alertas e eventos do escopo ativo
- `patients`: pacientes da organizacao, status, notas e caregivers atribuidos
- `devices`: inventario de devices, claim status, pairing code, URL recomendada de onboarding e vinculo com paciente
- `devices/:id`: telemetria, eventos, alertas e historico de assignment do device
- `alerts`: fila operacional e historico do escopo ativo
- `organization`: organizacao atual, memberships e criacao de novos membros

## Regras de UX por papel

Hoje a interface segue o que o backend permite:

- `organization_admin`: pode gerar codigo de pairing, editar metadados do device, vincular device a paciente, criar membros e criar/editar pacientes
- `caregiver`, `operator` e `viewer`: usam o escopo que o backend entrega; nao conseguem operar fora da propria organizacao
- se o backend restringir aquele usuario a pacientes atribuidos, a UI ja recebe os dados filtrados

## Pairing e vinculo device <-> paciente

Na tela `/devices`, o admin consegue:

1. gerar um codigo temporario de pareamento
2. opcionalmente associar um paciente inicial nesse codigo
3. ver a URL principal recomendada do backend na rede atual via `GET /api/system/network-info`
4. copiar URL e codigo
5. acompanhar expiracao do codigo e abrir fallbacks de rede apenas quando necessario
6. acompanhar o device passando de `unclaimed` para `claimed`
7. ajustar depois o vinculo com paciente

O frontend nao executa o claim diretamente no device. O claim efetivo acontece quando o ESP32 chama o backend com o codigo temporario.

Na tela `/patients`, o cadastro e a edicao agora tambem mostram `peso` e `altura`, preparando o dashboard e o firmware para futuras regras clinicas sem mover a edicao desses dados para o portal AP do ESP32.

## Tempo real

Depois do login, o frontend abre conexao `Socket.IO` e reage a:

- `alert:new`
- `alert:updated`
- `device:status`
- `telemetry:new`

Quando a organizacao ativa muda, a conexao e refeita para alinhar o escopo do socket ao tenant selecionado.

## Relacao com o portal local do ESP32

O portal do ESP32 nao substitui o frontend principal.

Na pratica:

- o portal do ESP32 serve para rede, MQTT, `BACKEND_API_BASE_URL` e pareamento
- o portal do ESP32 foi simplificado para URL do backend + codigo de pareamento + botao de envio
- o dashboard principal continua sendo a interface de operacao humana
- o modo de teste `MPU6050 + buzzer` segue sendo apenas local ao firmware e nao cria telas novas aqui
- o AP `Queda-Setup-*` so aparece quando o firmware entra em `SETUP_MODE` ou quando `FORCE_SETUP_MODE_ON_BOOT = true`
- se a equipe estiver depurando o ESP32 no Windows e a serial travar, o helper `.\scripts\free-serial-port.ps1 -Port COM4` pode liberar o monitor do `PlatformIO` sem impactar o frontend

## Como rodar isoladamente

```bash
cd frontend
npm install
npm run dev
```

Para a experiencia completa no Windows, com backend, banco, broker e automacao, prefira o guia [docs/quickstart-windows.md](../docs/quickstart-windows.md).
