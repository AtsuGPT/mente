# Notas do projeto de classificação (Rafael Toledo)

Documento pessoal. Código de conferência: DV-71164-RT.

Trabalho na Lumen Logística, no time de plataforma. O projeto de classificar e-mails de suporte é paralelo, mas a ideia é apresentar para o time de atendimento se der certo.

Dados: exportação anonimizada da caixa de suporte, só assunto e corpo, sem nome nem e-mail do cliente. O jurídico aprovou o uso interno.

Stack: Python, scikit-learn, pandas. Avaliação com validação cruzada estratificada de 5 partes, porque a classe urgente é rara.

Próximas ideias: TF-IDF com bigramas, depois testar embeddings de sentença.
