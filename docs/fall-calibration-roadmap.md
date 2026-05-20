# Roadmap de FFT e calibracao de movimento

Este documento prepara a evolucao futura sem mudar a decisao principal atual. Hoje a confirmacao de queda continua no firmware por limiares de impacto, mudanca de orientacao e imobilidade; o backend valida evidencia por telemetria persistida antes de criar alerta automatico.

## Camadas propostas

- `FallFeatureExtractor`: calcula features de uma janela curta de amostras, inicialmente no backend para estudo e depois, se viavel, no firmware.
- `FallDecisionEngine`: recebe features e um perfil de calibracao, mas fica em modo experimental ate validacao com hardware real.
- `FallCalibrationProfile`: guarda thresholds ou parametros por paciente/dispositivo.
- `MovementLabel`: rotulo controlado para `repouso`, `sentado`, `deitado`, `andando`, `correndo`, `queda`, `queda_com_imobilidade` e `sos_manual`.

## FFT/Fourier experimental

Uma janela pratica para ESP32/MPU6050 deve ficar entre 1s e 3s. Com amostragem de 20 Hz a 50 Hz, isso gera janelas pequenas o suficiente para:

- calcular energia por eixo em `ax`, `ay`, `az`, `gx`, `gy`, `gz`
- estimar energia total por banda
- identificar frequencia dominante por eixo
- comparar padroes de repouso, caminhada, corrida, sentado, deitado e queda

Esta camada nao deve substituir o detector atual ate existir base coletada e replay offline. O primeiro uso recomendado e diagnostico/calibracao, nao alarme automatico.

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
  status ENUM('draft', 'collecting', 'completed', 'discarded') NOT NULL DEFAULT 'draft',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
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
```

Esta proposta ainda nao deve ser aplicada ao schema principal. Ela serve como contrato de discussao para a proxima etapa, evitando uma calibracao incompleta atrapalhar o uso normal.
