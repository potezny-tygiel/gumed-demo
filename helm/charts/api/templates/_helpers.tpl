{{/*
API fullname
*/}}
{{- define "api.fullname" -}}
{{- printf "%s-api" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "api.labels" -}}
app.kubernetes.io/name: api
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: api
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "api.selectorLabels" -}}
app.kubernetes.io/name: api
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
PostgreSQL service name — references the parent chart's postgresql subchart
*/}}
{{- define "api.postgresHost" -}}
{{- printf "%s-postgresql" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
PostgreSQL secret name
*/}}
{{- define "api.postgresSecretName" -}}
{{- printf "%s-postgresql" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
