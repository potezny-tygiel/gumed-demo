{{/*
Frontend fullname
*/}}
{{- define "frontend.fullname" -}}
{{- printf "%s-frontend" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "frontend.labels" -}}
app.kubernetes.io/name: frontend
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "frontend.selectorLabels" -}}
app.kubernetes.io/name: frontend
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
API upstream — defaults to <release>-api:<api-port>
*/}}
{{- define "frontend.apiUpstream" -}}
{{- if .Values.apiUpstream -}}
{{- .Values.apiUpstream }}
{{- else -}}
{{- printf "%s-api:8000" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end }}
