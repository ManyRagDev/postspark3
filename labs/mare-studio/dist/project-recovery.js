const status = document.querySelector("#status");
try {
  const response = await fetch("/api/mare/projects", {credentials:"same-origin", cache:"no-store"});
  if (!response.ok) throw Error();
  const {projects} = await response.json();
  status.textContent = projects.length ? "Seus projetos salvos continuam disponíveis para download." : "Nenhum projeto salvo nesta conta.";
  for (const project of projects) {
    const link = document.createElement("a");
    link.href = "/api/mare/assets/" + encodeURIComponent(project.revisionId);
    link.textContent = "Baixar " + project.name;
    link.download = project.name + ".mare";
    const row = document.createElement("li");
    row.append(link);
    document.querySelector("#projects").append(row);
  }
} catch {
  status.textContent = "Não foi possível consultar os projetos salvos.";
}
