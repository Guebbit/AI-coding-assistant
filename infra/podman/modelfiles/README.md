# Modelfiles directory
#
# Place custom Ollama Modelfiles here.  Each file must end with .Modelfile
# and its base name becomes the model name.
#
# Example — save as `assistant.Modelfile`:
#
#   FROM llama3
#
#   SYSTEM """
#   You are a helpful assistant.  You answer questions concisely.
#   """
#
# The create-models.sh script will run `ollama create assistant -f assistant.Modelfile`
# when the model-loader container starts.
