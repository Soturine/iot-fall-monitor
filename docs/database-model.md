# Modelo de dados principal

Este diagrama resume as relações centrais do banco MySQL usado pelo `iot-fall-monitor`. Ele é uma visão de arquitetura para apresentação e manutenção; o contrato executável completo continua em [`database/schema.sql`](../database/schema.sql).

```mermaid
erDiagram
    USERS {
        bigint id PK
        varchar email UK
        enum global_role
        enum status
    }

    ORGANIZATIONS {
        bigint id PK
        varchar name
        enum type
        enum status
    }

    ORGANIZATION_MEMBERS {
        bigint id PK
        bigint organization_id FK
        bigint user_id FK
        enum role
    }

    PATIENTS {
        bigint id PK
        bigint organization_id FK
        varchar full_name
        enum status
    }

    DEVICES {
        bigint id PK
        bigint organization_id FK
        bigint current_patient_id FK
        varchar device_uid UK
        varchar device_identifier
        enum claim_status
    }

    DEVICE_ASSIGNMENT_HISTORY {
        bigint id PK
        bigint device_id FK
        bigint organization_id FK
        bigint patient_id FK
        datetime assignment_started_at
        datetime assignment_ended_at
    }

    DEVICE_STATUS {
        bigint id PK
        bigint device_id FK
        bigint organization_id FK
        bigint patient_id FK
        boolean online
        tinyint battery_percent
        varchar detector_mode
        datetime last_seen_at
    }

    BATTERY_CALIBRATIONS {
        bigint id PK
        bigint device_id FK
        tinyint battery_percent
        datetime calibrated_at
        double applied_minutes_per_percent
    }

    TELEMETRY_LOGS {
        bigint id PK
        bigint organization_id FK
        bigint patient_id FK
        bigint device_id FK
        double accel_magnitude
        double gyro_magnitude
        datetime created_at
    }

    EVENTS {
        bigint id PK
        bigint organization_id FK
        bigint patient_id FK
        bigint device_id FK
        varchar event_type
        enum severity
        json evidence_summary_json
        json raw_payload_json
    }

    EVENT_TELEMETRY_EVIDENCE {
        bigint id PK
        bigint event_id FK
        bigint telemetry_log_id FK
        int relative_ms
        enum role
    }

    ALERTS {
        bigint id PK
        bigint organization_id FK
        bigint patient_id FK
        bigint event_id FK
        bigint device_id FK
        enum status
    }

    ALERT_ACTIONS {
        bigint id PK
        bigint alert_id FK
        bigint user_id FK
        enum action_type
        varchar note
    }

    AUDIT_LOGS {
        bigint id PK
        bigint organization_id FK
        bigint user_id FK
        varchar action
        varchar entity_type
        bigint entity_id
    }

    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : possui
    USERS ||--o{ ORGANIZATION_MEMBERS : participa
    ORGANIZATIONS ||--o{ PATIENTS : acompanha
    ORGANIZATIONS ||--o{ DEVICES : reivindica
    PATIENTS o|--o{ DEVICES : vinculo_atual
    DEVICES ||--o{ DEVICE_ASSIGNMENT_HISTORY : preserva_historico
    PATIENTS o|--o{ DEVICE_ASSIGNMENT_HISTORY : recebe
    DEVICES ||--|| DEVICE_STATUS : possui_snapshot
    DEVICES ||--o{ BATTERY_CALIBRATIONS : recalibra
    DEVICES ||--o{ TELEMETRY_LOGS : publica
    DEVICES ||--o{ EVENTS : gera
    EVENTS ||--o{ EVENT_TELEMETRY_EVIDENCE : relaciona
    TELEMETRY_LOGS ||--o{ EVENT_TELEMETRY_EVIDENCE : evidencia
    EVENTS ||--o| ALERTS : pode_gerar
    ALERTS ||--o{ ALERT_ACTIONS : recebe
    USERS ||--o{ ALERT_ACTIONS : executa
    ORGANIZATIONS ||--o{ AUDIT_LOGS : audita
    USERS o|--o{ AUDIT_LOGS : realiza
```

## Leitura do fluxo

1. Organização, usuários e memberships definem o escopo multi-tenant.
2. O device pode ser vinculado a um paciente, preservando mudanças em `device_assignment_history`.
3. `device_status` mantém o snapshot operacional; `telemetry_logs` mantém amostras válidas.
4. Eventos relacionam evidências de telemetria e podem originar um único alerta.
5. Ações humanas e operações administrativas permanecem rastreáveis em `alert_actions` e `audit_logs`.
6. Calibrações manuais de bateria ficam em `battery_calibrations` e alimentam a estimativa exibida no snapshot.

O `schema.sql` é voltado à criação/reset consciente de ambiente. Em bancos existentes, use somente as migrações idempotentes documentadas no projeto.
