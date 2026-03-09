{{/*
PostgreSQL fullname
*/}}
{{- define "postgresql.fullname" -}}
{{- printf "%s-postgresql" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "postgresql.labels" -}}
app.kubernetes.io/name: postgresql
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: database
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "postgresql.selectorLabels" -}}
app.kubernetes.io/name: postgresql
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
