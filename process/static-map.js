//staticMode 模式的map策略
//autocombine以及静态资源内联

function pack(ret, file, rs, opt){
    var urlMap = ret.feather.urlMap, uriMap = ret.feather.uriMap, autoCombine = feather.config.get('autoCombine');
    var noPkgs = [];

    if(!autoCombine) return rs;

    rs.forEach(function(resource, key){
        var subpath = uriMap[resource];

        if(subpath){
            var info = urlMap[subpath];

            if(!info.isPkg && !info.pkg && ret.src[subpath]){
                noPkgs.push(subpath);
                rs[key] = subpath;
            }
        }
    });

    if(noPkgs.length > 1){
        var content = '', type = ret.src[noPkgs[0]].ext.slice(1);

        noPkgs.forEach(function(pkg){
            content += ret.src[pkg].getContent() + '\r\n';
        });

        var path = '/static/combine/' + feather.util.md5(file.subpath, 10) + '.' + (type == 'css' ? 'css' : 'js');
        var pkgFile = new feather.file(feather.project.getProjectPath() + path);
        pkgFile.setContent(content);

        ret.pkg[path] = pkgFile;
        rs[rs.indexOf(noPkgs[0])] = pkgFile.getUrl(opt.md5, opt.domain);

        for(var i = 1; i < noPkgs.length; i++){
            rs.splice(rs.indexOf(noPkgs[i]), 1);
        }
    }

    return rs;
}

function getStaticRequireMapAndDeps(resources, urls, deps){
    if(!resources || !resources.length){
        return {map: {}, deps: {}};
    }

    var hash = getAllResource(resources, urls, deps, true);
    var mapResult = {}, depsResult = {};

    feather.util.map(hash, function(key, item){
        if(!mapResult[item]){
            mapResult[item] = [];
        }

        mapResult[item].push(key);

        var info;

        if(info = urls[key]){
            if(deps[key] && info.isMod){
                depsResult[key] = deps[key];
            }
        }
    });

    feather.util.map(mapResult, function(key, map){
        mapResult[key] = feather.util.unique(map);
    });

    return {map: mapResult, deps: depsResult};
}

function getAllResource(resources, urls, deps, returnHash, hash, pkgHash){
    var tmp = [];

    hash = hash || {};
    pkgHash = pkgHash || {};

    resources.forEach(function(resource){
        var _ = urls[resource], pkgName, url;

        if(_){
            if(!hash[resource]){
                if(pkgName = _.pkg){
                    var pkg;

                    if(pkg = pkgHash[pkgName]){
                        url = hash[resource] = pkgHash[pkgName];
                    }else{
                        url = hash[resource] = pkgHash[pkgName] = urls[_.pkg].domainUrl;

                        if(deps[pkgName] && !_.isMod){
                            tmp = tmp.concat(getAllResource(deps[pkgName], urls, deps, returnHash, hash, pkgHash));
                        }
                    }

                    if(_.isMod && deps[resource]){
                        tmp = tmp.concat(getAllResource(deps[resource], urls, deps, returnHash, hash, pkgHash));
                    }
                }else{
                    url = hash[resource] = _.domainUrl;

                    if(deps[resource]){
                        tmp = tmp.concat(getAllResource(deps[resource], urls, deps, returnHash, hash, pkgHash));
                    }
                }
            }else{
                url = hash[resource];
            }
        }else{
            url = resource;
        }
        
        tmp.push(url);
    });

    return !returnHash ? feather.util.unique(tmp) : hash;
}


module.exports = function(ret, conf, setting, opt){
	var featherMap = ret.feather;
    var resources = featherMap.resource, deps = featherMap.deps, urls = featherMap.urlMap, commonMap = featherMap.commonResource;

    feather.util.map(ret.src, function(subpath, file){
        if(file.isHtmlLike){
            var resource = featherMap.resource[subpath], content = file.getContent();
            var head = '', bottom = '', css = resource.css || [], headJs = resource.headJs || [], bottomJs = resource.bottomJs || [];

            if(!file.isPageletLike){
                css.unshift.apply(css, commonMap.css);
                headJs.unshift.apply(headJs, commonMap.headJs);
                bottomJs.unshift.apply(bottomJs, commonMap.bottomJs);
            }  

            css = getAllResource(css, urls, deps);

            if(opt.pack){
                css = pack(ret, file, css, opt);
            }

            css.forEach(function(v){
                head += '<link rel="stylesheet" href="' + v + '" type="text/css" />';
            });


            headJs = getAllResource(headJs, urls, deps);

            if(opt.pack){
                headJs = pack(ret, file, headJs, opt);
            }
            
            headJs.forEach(function(js){
                head += '<script src="' + js + '"></script>';
            });

            var md = getStaticRequireMapAndDeps(deps[subpath], urls, deps);
            
            if(!file.isPageletLike){
                var domain = feather.config.get('require.config.domain', feather.config.get('roadmap.domain'));

                if(domain){
                    md.domain = domain;
                }
            }
            	
            head += '<script>require.mergeConfig(' + feather.util.json(md) + ')</script>';
            

            bottomJs = getAllResource(bottomJs, urls, deps);

            if(opt.pack){
                bottomJs = pack(ret, file, bottomJs, opt);
            }

            bottomJs.forEach(function(js){
                bottom += '<script src="' + js + '"></script>';
            });

            if(!file.isPageletLike){
                if(/<\/head>/.test(content)){
                    content = content.replace(/<\/head>/, function(){
                        return head + '</head>';
                    });
                }else{
                    content = head + content;
                }
                
                if(/<\/body>/.test(content)){
                    content = content.replace(/<\/body>/, function(){
                        return bottom + '</body>';
                    });
                }else{
                    content += bottom;
                }
            }else{
                content = head + content + bottom;
            }

            file.setContent(content);
        }
    });
};