# Збирає фронтенд (Node) і API (.NET 10) в один образ — для Render та інших Docker-хостингів
FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# vite.config.js збирає у ../SchuoolBuddy.API/wwwroot
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY SchuoolBuddy.API/ SchuoolBuddy.API/
COPY --from=web /src/SchuoolBuddy.API/wwwroot SchuoolBuddy.API/wwwroot
RUN dotnet publish SchuoolBuddy.API/SchuoolBuddy.API.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /app ./
ENV ASPNETCORE_ENVIRONMENT=Production
# Порт бере зі змінної PORT (її задає Render), див. Program.cs
EXPOSE 10000
ENTRYPOINT ["dotnet", "SchuoolBuddy.API.dll"]
