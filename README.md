# dc-outdated

_dc-outdated_ (docker-compose-outdated) is a command line utiltiy that allows to easily check for outdated docker images in your docker-compose.yml file (just like _outdated_ command in _npm_ or _yarn_). Therefore it fetches for each image definition in your docker-compose.yml file, the latest available tag (according to the _semver_ versioning schema -> tags that do not match the semver versioning schema will be ignored) from the according docker registry. If the version (tag) of the image definition in the _docker-compose.yml_ file.

## Prerequisites

If you are using images from a private registry it is neccessary to login to that registry (_docker login_ command) before executing this application. This is required, since _dc-outdated_ reads login-credentials from the user's docker config file by default. By default, this application searches for a _docker-compose.yml_ file in the current working directory (same behavior as docker-compose utility). Hence, the directory in which the application is executed, must contain a valid **docker-compose.yml** file.
In order to make this tool work correctly it is neccessary that all images in the _docker-compose.yml_ file are specified with a semver compliant tag. Otherwise execution will fail.


## Usage

You can use this utilty by installing it globally and executing it in your project's root directory:

```
npm i -g  dc-outdated
cd /path/to/your/project
dc-outdated
```

If the compose file contains outdated docker images, the programm will list the outdated image names as well as the current and latest version of the image:

```
Image                 Upgrade Type  Current Version  Latest Version
--------------------  ------------  ---------------  --------------
library/rabbitmq       minor         3.6.16           3.7.7         
library/mongo          minor         3.4.16           3.6.6         
library/influxdb       major         0.13.0           1.5.4 
```

For advanced usage, command line flags can be used to change the default behavoir of the application:

| Flag                        | Description                                                                                                                                         |
| ----------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| --compose-file <file path>  | Path to the docker-compose file. Defaults to ./docker-compose.yml                                                                                   |
| --docker-config <file path> | Path to the docker config file, from which authentication details taken. Defaults to ~/.docker/config.json                                          |
| --filter <string>           | Filter string to optionally filter the list of checked-images. If specified, only images-names that contain the given search string will be checked |


However, for a fully detailed description of all flags that can be used, see the application's usage information (`dc-outdated --help`).

## TODOs

* For now only docker compose files of version 2.x were tested. For the future docker-compose version 3 should be supported too
* At this moment checking for outdated images on against the official docker registry is not fully working. Hence, only images from a self-hosted docker registry (v2) can be checked reliable. This will be changed in the future so that all kind of docker registries are supported. For now you will have to login to _registry-1.docker.io_ in order to verfy images from offical docker registry.
