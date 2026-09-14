# Candidaturas privadas de publicación

Cada resultado público nace como una candidatura privada en el SSD externo:

```text
state/review/candidates/<candidate-id>/
├── candidate.json
└── package/
    ├── summary.md
    └── evidence/…
```

`candidate.json` sigue el formato de [review-candidate.example.json](../examples/review-candidate.example.json). El ejemplo no debe copiarse al repositorio de resultados: se coloca exclusivamente bajo `state/review/candidates/`.

La candidatura contiene solo metadatos y una lista explícita de los archivos que se podrán publicar. No debe incluir credenciales, valores de variables de entorno, transcripciones completas, rutas personales ni el contenido de logs privados. Los archivos candidatos viven en `package/` y el empaquetador vuelve a calcular el hash de la lista permitida antes de revisar o publicar.

El hash `packageHash` se completa después de crear el paquete candidato. Si un archivo permitido cambia, el hash deja de coincidir y la candidatura no puede aprobarse ni pasar a `published/` hasta una nueva revisión humana.

El contrato también exige que el `runId` de la candidatura y del manifiesto público sea el mismo. Así, una candidatura no puede terminar publicada como resultado de otra ejecución.
