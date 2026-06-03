# Frontend do Sistema Queda

Dashboard web responsivo para autenticação, operação multi-tenant, gestao de pacientes, devices pareados, alertas e tempo real.

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

## Variáveis de ambiente

```env
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
```

O frontend agora normaliza essas URLs em `src/config/runtime.ts`, evitando problemas simples com barra final duplicada e mantendo a base da API e do `Socket.IO` coerentes.

## Scripts

- `npm run dev`: inicia o Vite
- `npm run build`: gera o build de produção
- `npm run preview`: serve o build localmente
- `npm run lint`: lint do projeto

## Estabilizacao e performance local

Nesta rodada, o frontend recebeu uma passada de estabilizacao para o modelo multi-tenant:

- rotas principais agora usam carregamento sob demanda para reduzir o bundle inicial
- o contexto `Socket.IO` foi ajustado para reconectar de forma mais limpa quando token ou organização ativa mudam
- o modal de edição de device foi corrigido para não reciclar estado antigo entre dispositivos diferentes
- o dashboard voltou a renderizar corretamente o paciente dos eventos recentes vindos do backend
- a página `/devices/:id` aplica `telemetry:new` incrementalmente e também faz refresh HTTP leve a cada 10s, para manter o gráfico responsivo se algum evento realtime se perder
- o gráfico de telemetria mostra segundos quando a janela e curta e exibe pontos nas séries, facilitando enxergar amostras chegando em bancada

## Fluxo de autenticação

A tela `/login` agora suporta dois caminhos diferentes:

- `Entrar`: usar um usuário já vinculado a uma organização
- `Criar conta`: criar uma nova organização e autenticar o `organization_admin` inicial

Regras atuais:

- se `database/seed.sql` foi aplicado, existe o acesso demo `admin@queda.local / Admin@123`
- o cadastro não cria mais apenas um usuário solto; ele cria também a organização inicial
- o token JWT e salvo em `localStorage`
- a organização ativa também fica salva localmente
- as rotas internas continuam protegidas por `ProtectedRoute`
- a sidebar mostra `Sair` e `Trocar usuário`
- `Sair` limpa a sessão local e derruba o `Socket.IO`
- `/login?force=1` permite voltar ao formulario de login mesmo com sessão ativa

## Organizacao ativa e escopo

Depois do login, a sidebar mostra:

- nome da organização ativa
- papel do usuário naquela organização
- seletor de organização quando o usuário possui mais de uma membership
- mensagem explícita quando a sessão possui apenas uma organização ativa ou quando não há membership trocável

O frontend envia `X-Organization-Id` automaticamente para a API e também informa `organizationId` no handshake do `Socket.IO`.

Isso significa que:

- o dashboard deixa de ser global
- listas de pacientes, devices, alertas e eventos passam a refletir apenas o tenant ativo
- o frontend depende do backend filtrado e não tenta resolver segurança apenas escondendo componentes

## Reidratação de sessão e recuperação de erro

O `AuthProvider` agora:

- normaliza sessão salva no `localStorage` antes de usar os dados em memória
- reidrata o usuário autenticado com `GET /api/me` no boot
- limpa a sessão automaticamente se o token estiver inválido ou se o navegador estiver preso a um shape antigo de autenticação

Tambem existe um `AppErrorBoundary` no topo da arvore:

- ele evita tela branca total em erro de renderizacao
- mostra a mensagem técnica básica
- oferece o atalho `Limpar sessão local e abrir login`

Esse fluxo foi adicionado porque a migração para multi-tenant pode deixar navegadores com `user` antigo salvo, sem `memberships`, o que antes derrubava toda a interface.

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

- `login`: entrar com usuário existente ou criar uma nova organização
- `dashboard`: metricas, dispositivos, alertas e eventos do escopo ativo
- `patients`: pacientes da organização, status, notas e caregivers atribuidos
- `devices`: inventario de devices, claim status, pairing code, URL recomendada de onboarding e vinculo com paciente
- `devices/:id`: telemetria, eventos, alertas e histórico de assignment do device
- `alerts`: fila operacional e histórico do escopo ativo
- `organization`: organização atual, memberships e criação de novos membros

## Regras de UX por papel

Hoje a interface segue o que o backend permite:

- `organization_admin`: pode gerar código de pairing, editar metadados do device, vincular device a paciente, criar membros e criar/editar pacientes
- `caregiver`, `operator` e `viewer`: usam o escopo que o backend entrega; não conseguem operar fora da própria organização
- se o backend restringir aquele usuário a pacientes atribuidos, a UI já recebe os dados filtrados

## Pairing e vinculo device <-> paciente

Na tela `/devices`, o admin consegue:

1. gerar um código temporário de pareamento
2. opcionalmente associar um paciente inicial nesse código
3. ver a URL principal recomendada do backend na rede atual via `GET /api/system/network-info`
4. copiar URL e código
5. acompanhar expiração do código e abrir fallbacks de rede apenas quando necessário
6. acompanhar o device passando de `unclaimed` para `claimed`
7. ajustar depois o vinculo com paciente

O frontend não executa o claim diretamente no device. O claim efetivo acontece quando o ESP32 chama o backend com o código temporário.

Na tela `/patients`, o cadastro e a edição agora também mostram `peso` e `altura`, preparando o dashboard e o firmware para futuras regras clinicas sem mover a edição desses dados para o portal AP do ESP32.

## Tempo real

Depois do login, o frontend abre conexão `Socket.IO` e reage a:

- `alert:new`
- `alert:updated`
- `device:status`
- `telemetry:new`

Quando a organização ativa muda, a conexão e refeita para alinhar o escopo do socket ao tenant selecionado.

No refresh/F5, o app reidrata a sessão por `GET /api/me`, descarta apenas uma organização salva inválida e cria o Socket.IO somente depois de token, usuário e organização ativa estarem coerentes.

## Relacao com o portal local do ESP32

O portal do ESP32 não substitui o frontend principal.

Na prática:

- o portal do ESP32 serve para rede, MQTT, `BACKEND_API_BASE_URL` e pareamento
- o portal do ESP32 foi simplificado para URL do backend + código de pareamento + botão de envio
- o dashboard principal continua sendo a interface de operação humana
- o modo de teste `MPU6050 + buzzer` segue sendo apenas local ao firmware e não cria telas novas aqui
- em bancada, o AP curto `Q-ESP32-*` pode ficar ativo em paralelo com Wi-Fi/MQTT por `SETUP_PORTAL_ALWAYS_ON = true`
- se a equipe estiver depurando o ESP32 no Windows e a serial travar, o helper `.\scripts\free-serial-port.ps1 -Port COM4` pode liberar o monitor do `PlatformIO` sem impactar o frontend

## Como rodar isoladamente

```bash
cd frontend
npm install
npm run dev
```

Para a experiencia completa no Windows, com backend, banco, broker e automação, prefira o guia [docs/quickstart-windows.md](../docs/quickstart-windows.md).
