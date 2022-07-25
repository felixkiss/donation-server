## Basic setup
1. Create docker volume using `docker volume create donation-server_data`
2. Copy `config.default.toml` to `/var/lib/docker/volumes/donation-server_data/_data/config.toml`
3. Configure settings in config.toml
4. Pull docker image from Github using `docker pull docker.pkg.github.com/linkswien/donation-server/donation-server:main` or build your own using `docker build . -t donation-server`
5. Run docker image: `docker run -d -p 3000:3000/tcp --name donation-server --restart=always --mount source=donation-server_data,target=/data -e CONFIG_PATH=/data/config.toml docker.pkg.github.com/linkswien/donation-server/donation-server:main`
