{{/*
Ingestion fullname
*/}}
{{- define "ingestion.fullname" -}}
{{- printf "%s-ingestion" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "ingestion.labels" -}}
app.kubernetes.io/name: ingestion
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: ingestion
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{/*
PostgreSQL service name
*/}}
{{- define "ingestion.postgresHost" -}}
{{- printf "%s-postgresql" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
PostgreSQL secret name
*/}}
{{- define "ingestion.postgresSecretName" -}}
{{- printf "%s-postgresql" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
