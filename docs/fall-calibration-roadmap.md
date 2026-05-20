# Roadmap de FFT e calibracao de movimento

Este documento prepara a evolucao futura sem mudar a decisao principal atual. Hoje a confirmacao de queda continua no firmware por limiares de impacto, mudanca de orientacao e imobilidade; o backend valida evidencia por telemetria persistida antes de criar alerta automatico.

## Camadas propostas

- `FallFeatureExtractor`: calcula features de uma janela curta de amostras. Nesta rodada ele existe no firmware em modo leve, com janela circular e features no dominio do tempo.
- `FallDecisionEngine`: recebe features e um perfil de calibracao, mas fica em modo experimental ate validacao com hardware real. A decisao principal ainda e a FSM `impacto -> orientacao -> imobilidade`.
- `FallCalibrationProfile`: guarda thresholds ou parametros por paciente/dispositivo.
- `MovementLabel`: rotulo controlado para `repouso`, `sentado`, `deitado`, `andando`, `correndo`, `queda`, `queda_com_imobilidade` e `sos_manual`.
- `ActivityState`: estado operacional exibido no painel, sempre como heuristica experimental.

## Implementado agora

- `FALL_FEATURE_EXTRACTOR_ENABLED=true` habilita a coleta lateral de features.
- `FALL_FFT_EXPERIMENTAL_ENABLED=false` deixa Fourier/FFT fora da decisao principal.
- `FALL_FFT_WINDOW_SIZE=64` prepara janela de 64 amostras.
- Com `SENSOR_SAMPLE_INTERVAL_MS=50`, a taxa esperada fica em cerca de `20 Hz` e a janela de 64 amostras cobre cerca de `3,2 s`.
- O payload `fall_detected` inclui `decision_source`, `algorithm_version`, `confidence`, picos, janela, imobilidade, `features_time_domain`, `features_frequency_domain` e `linked_telemetry_window`.
- `features_frequency_domain` nasce com `available=false`, `experimental=true` e motivo `fft_experimental_disabled`.

Features no dominio do tempo calculadas no firmware:

- medias de `ax`, `ay`, `az`, `gx`, `gy`, `gz`
- desvios padrao por eixo
- energia no tempo por eixo, como soma de quadrados
- pico de aceleracao resultante
- pico de giro resultante
- jerk aproximado pela variacao de magnitude da aceleracao

## FFT/Fourier experimental

Uma janela pratica para ESP32/MPU6050 deve ficar entre 1s e 3s. Com amostragem de 20 Hz a 50 Hz, isso gera janelas pequenas o suficiente para:

- calcular energia por eixo em `ax`, `ay`, `az`, `gx`, `gy`, `gz`
- estimar energia total por banda
- identificar frequencia dominante por eixo
- comparar padroes de repouso, caminhada, corrida, sentado, deitado e queda

Esta camada nao deve substituir o detector atual ate existir base coletada e replay offline. O primeiro uso recomendado e diagnostico/calibracao, nao alarme automatico.

Referencias tecnicas consultadas indicam que abordagens embarcadas de queda costumam equilibrar features simples, janelas curtas e custo computacional. Ha exemplos de amostragem baixa em torno de `25 Hz`, janelas de `3 s` com acelerometro + giroscopio e uso de STFT/energia em baixas frequencias para diferenciar queda de atividades de vida diaria. Por isso, a decisao segura aqui e coletar features e deixar FFT como diagnostico futuro, nao como classificador ativo.

## Uso futuro do botao SOS para calibracao

Fluxo proposto:

1. Pressionamento longo do SOS entra em modo de calibracao somente quando habilitado por flag.
2. O operador escolhe a classe no painel ou alterna uma classe segura no device.
3. O sistema coleta cerca de 10 execucoes por classe.
4. Cada execucao salva amostras brutas e features calculadas.
5. Peso e altura do paciente podem entrar como metadados do perfil, sem alterar o portal AP em cadastro clinico.
6. O backend gera um perfil de calibracao por paciente/dispositivo.
7. O firmware recebe apenas parametros compactos e versionados.

## Proposta de schema

```sql
CREATE TABLE calibration_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  movement_label VARCHAR(80) NULL,
  status ENUM('draft', 'collecting', 'completed', 'discarded') NOT NULL DEFAULT 'draft',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  notes VARCHAR(255) NULL,
  metadata_json JSON NULL,
  PRIMARY KEY (id)
);

CREATE TABLE calibration_samples (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  calibration_session_id BIGINT UNSIGNED NOT NULL,
  movement_label VARCHAR(80) NOT NULL,
  run_index INT UNSIGNED NOT NULL,
  sample_count INT UNSIGNED NOT NULL,
  window_seconds DECIMAL(8, 3) NULL,
  raw_payload_json JSON NULL,
  features_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE calibration_feature_sets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  calibration_sample_id BIGINT UNSIGNED NOT NULL,
  algorithm_version VARCHAR(80) NOT NULL,
  features_time_domain_json JSON NULL,
  features_frequency_domain_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE calibration_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NULL,
  device_id BIGINT UNSIGNED NOT NULL,
  algorithm_version VARCHAR(80) NOT NULL,
  status ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'draft',
  profile_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
```

Esta proposta ainda nao deve ser aplicada ao schema principal. Ela serve como contrato de discussao para a proxima etapa, evitando uma calibracao incompleta atrapalhar o uso normal.

## Proxima etapa recomendada

1. Criar migracao idempotente para as tabelas de calibracao quando houver UI/fluxo pronto.
2. Adicionar modo explicito no backend/frontend para iniciar sessao de calibracao.
3. Usar o botao SOS apenas como entrada fisica quando a sessao ja estiver autorizada.
4. Coletar pelo menos 10 runs por classe antes de ajustar thresholds.
5. Implementar FFT leve offline ou em firmware por flag, validar replay e so entao considerar uso na decisao.
