d(a) : Dependency of 'a' `npm view <package>@<version> dependencies --json`
(a)d : Dependent of 'a' `npm ls <package>@<version> --json`

Let {U} = set of update we want to apply to package.json
	{P} = set of packages in package.json
	
#self satisfaction of {U} #virtual
for x in {U}:
    {D} = d(x)
	for a in {D}:
		if semver_satisfy( a , {P} + {U.new_version} )
			continue
		else
			Exception "Dependency conflict detected for [x/a]"

#dependent check 
for x in {U}:
	{RD} = (x.old_version)d , #dependent set of x
	for a in {RD}:
		if semver_satisfy( d(a) , x.new_version )
			continue;
		else
            a = find_exact_next_version(a)
			{U} = {U} + a
            #self satisfaction needed

